const Student = require('../models/Student');
const Course = require('../models/Course');
const EnrollmentRequest = require('../models/EnrollmentRequest');
const AttendanceRecord = require('../models/AttendanceRecord');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const mlClient = require('./mlClient');
const storageService = require('./storageService');
const auditService = require('./auditService');
const { isObjectId } = require('../utils/objectId');
const { skipFor, toPagination } = require('../utils/pagination');
const { ROLES, ENROLLMENT_REQUEST_STATUS, AUDIT_ACTIONS, RECORD_STATUS, SESSION_STATUS } = require('../config/constants');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getByRef = async (ref) => {
  const filter = isObjectId(ref) ? { _id: ref } : { studentId: ref };
  const student = await Student.findOne(filter);
  if (!student) throw new AppError('Student not found', 404, { code: 'STUDENT_NOT_FOUND' });
  return student;
};

const assertCanView = async (user, student) => {
  if (user.role === ROLES.ADMIN) return;
  if (
    user.role === ROLES.STUDENT &&
    user.studentId &&
    (String(user.studentId) === String(student._id) || String(user.studentId) === student.studentId)
  ) {
    return;
  }
  if (user.role === ROLES.PROFESSOR) {
    const teaches = await Course.exists({
      professorId: user._id,
      semester: student.semester,
      section: student.section
    });
    if (teaches) return;
  }
  throw new AppError('You are not authorized to view this student', 403, { code: 'FORBIDDEN' });
};

const professorScope = async (user) => {
  const courses = await Course.find({ professorId: user._id }).select('semester section').lean();
  return courses.map((course) => ({ semester: course.semester, section: course.section }));
};

const list = async (user, query) => {
  const conditions = [];

  if (user.role === ROLES.PROFESSOR) {
    const scope = await professorScope(user);
    if (scope.length === 0) return { students: [], pagination: toPagination(query, 0) };
    conditions.push({ $or: scope });
  }
  if (query.semester !== undefined) conditions.push({ semester: query.semester });
  if (query.section) conditions.push({ section: query.section });
  if (query.department) conditions.push({ department: query.department });
  if (query.active !== undefined) conditions.push({ active: query.active });
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    conditions.push({ $or: [{ name: pattern }, { studentId: pattern }, { rollNumber: pattern }] });
  }

  const filter = conditions.length ? { $and: conditions } : {};
  const [students, total] = await Promise.all([
    Student.find(filter).sort({ rollNumber: 1 }).skip(skipFor(query)).limit(query.limit),
    Student.countDocuments(filter)
  ]);
  return { students, pagination: toPagination(query, total) };
};

const getOne = async (user, ref) => {
  const student = await getByRef(ref);
  await assertCanView(user, student);
  return student;
};

const create = (data) => Student.create(data);

// Professors may correct who a student is (name, roll number, department) for the cohorts they teach.
const PROFESSOR_EDITABLE = ['name', 'rollNumber', 'department'];

const update = async (user, ref, data) => {
  const student = await getByRef(ref);
  let changes = data;
  if (user.role !== ROLES.ADMIN) {
    await assertCanView(user, student);
    changes = Object.fromEntries(Object.entries(data).filter(([key]) => PROFESSOR_EDITABLE.includes(key)));
    if (Object.keys(changes).length === 0) {
      throw new AppError('You can only edit name, roll number and department', 403, { code: 'FORBIDDEN' });
    }
  }
  student.set(changes);
  // Once a person has set a real name or roll number it is no longer a generated placeholder.
  if ('name' in changes || 'rollNumber' in changes) student.autoEnrolled = false;
  await student.save();
  return student;
};

const deactivate = async (ref) => {
  const student = await getByRef(ref);
  student.active = false;
  await student.save();
  return student;
};

const registerFace = async (ref, files) => {
  if (!files || files.length !== 1) {
    throw new AppError('Exactly one image is required in the "image" field', 400, { code: 'INVALID_UPLOAD' });
  }
  const student = await getByRef(ref);
  const [stored] = await storageService.commitUploads(files, 'registered-faces', `${student._id}-`);
  const previous = student.registeredImage;

  let updated;
  try {
    await Student.updateOne(
      { _id: student._id },
      { $set: { registeredImage: stored.relativePath, faceEmbeddings: [], embeddingModel: null, hasFaceEmbedding: false } }
    );
    updated = await Student.findById(student._id);
  } catch (error) {
    await storageService.removeFiles([stored.absolutePath]);
    throw error;
  }
  await storageService.removeStored(previous);
  return updated;
};

const generateEmbedding = async (ref) => {
  const student = await getByRef(ref);
  if (!student.registeredImage) {
    throw new AppError('Register a face image before generating an embedding', 409, { code: 'NO_REGISTERED_IMAGE' });
  }
  const buffer = await storageService.readFile(student.registeredImage);
  const filename = student.registeredImage.split('/').pop();
  const mimeType = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const result = await mlClient.generateEmbedding({ buffer, filename, mimeType });

  await Student.updateOne(
    { _id: student._id },
    { $set: { faceEmbeddings: [result.embedding], embeddingModel: result.embeddingModel || null, hasFaceEmbedding: true } }
  );
  const updated = await Student.findById(student._id);
  return { student: updated, embeddingSize: result.embedding.length, faceQuality: result.faceQuality ?? null };
};

const listEnrolledForCourse = (course) =>
  Student.find({ semester: course.semester, section: course.section, active: true })
    .select('+faceEmbeddings')
    .sort({ rollNumber: 1 })
    .lean();

// Is this roll number already on the roster for this course?
const findInCourse = async (rollNumber, course) =>
  Student.findOne({
    rollNumber,
    semester: course.semester,
    section: course.section,
    active: true
  });

const assertCourseExists = async (courseId) => {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found', 404, { code: 'COURSE_NOT_FOUND' });
  return course;
};

// Profile setup: the student picks year/sem/dept/course, types their roll number (their attendance id) and uploads a face photo.
const buildProfile = async (user, files, body) => {
  let course;
  try {
    course = await assertCourseExists(body.courseId);
  } catch (error) {
    await storageService.removeFiles((files || []).map((file) => file.path));
    throw error;
  }

  const existing = await findInCourse(body.rollNumber, course);
  if (existing) {
    // Linking exposes that student's attendance history.
    const claimedBy = await User.exists({ studentId: String(existing._id), _id: { $ne: user._id } });
    if (claimedBy) {
      throw new AppError('This roll number is already linked to another account', 409, {
        code: 'ROLL_NUMBER_CLAIMED'
      });
    }
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          studentId: String(existing._id),
          profile: {
            rollNumber: body.rollNumber,
            name: body.name || user.name || existing.name,
            year: body.year ?? null,
            semester: course.semester,
            department: body.department || existing.department
          }
        }
      }
    );
    // The photo is not needed when the roll number is already on the roster.
    await storageService.removeFiles((files || []).map((file) => file.path));
    return {
      enrolled: true,
      request: null,
      student: existing.toJSON ? existing.toJSON() : existing,
      course: course.toJSON ? course.toJSON() : course
    };
  }

  if (!files || files.length !== 1) {
    throw new AppError('Exactly one face photo is required in the "image" field', 400, { code: 'INVALID_UPLOAD' });
  }
  if (!body.year) {
    await storageService.removeFiles(files.map((file) => file.path));
    throw new AppError('year is required when requesting enrollment', 400, { code: 'VALIDATION_ERROR' });
  }

  const duplicate = await EnrollmentRequest.findOne({
    userId: user._id,
    courseId: course._id,
    status: ENROLLMENT_REQUEST_STATUS.PENDING
  });
  if (duplicate) {
    await storageService.removeFiles(files.map((file) => file.path));
    throw new AppError('You already have a pending request for this course', 409, { code: 'REQUEST_PENDING' });
  }

  const [stored] = await storageService.commitUploads(files, 'profile-images', `${user._id}-`);
  let request;
  try {
    request = await EnrollmentRequest.create({
      userId: user._id,
      courseId: course._id,
      rollNumber: body.rollNumber,
      name: body.name || user.name,
      year: body.year,
      semester: course.semester,
      department: body.department,
      imagePath: stored.relativePath,
      status: ENROLLMENT_REQUEST_STATUS.PENDING
    });
  } catch (error) {
    await storageService.removeFiles([stored.absolutePath]);
    throw error;
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        profile: {
          rollNumber: body.rollNumber,
          name: body.name || user.name,
          year: body.year ?? null,
          semester: course.semester,
          department: body.department
        }
      }
    }
  );

  await auditService.record(
    auditService.userEntry(user, {
      action: AUDIT_ACTIONS.ENROLLMENT_REQUESTED,
      after: { courseId: course._id, rollNumber: body.rollNumber }
    })
  );

  return {
    enrolled: false,
    request: request.toJSON ? request.toJSON() : request,
    student: null,
    course: course.toJSON ? course.toJSON() : course
  };
};

// Current student's own profile state.
const getProfile = async (user) => {
  const fresh = await User.findById(user._id).lean();
  if (!fresh) throw new AppError('Account not found', 404, { code: 'USER_NOT_FOUND' });
  const profile = fresh.profile || {};
  const profileComplete = Boolean(profile.rollNumber);
  const linkedStudent =
    fresh.studentId && isObjectId(fresh.studentId)
      ? await Student.findById(fresh.studentId).lean()
      : null;
  const pendingRequests = await EnrollmentRequest.find({
    userId: fresh._id,
    status: ENROLLMENT_REQUEST_STATUS.PENDING
  })
    .populate('courseId', 'courseCode courseName')
    .lean();
  return {
    profile,
    studentId: fresh.studentId || null,
    profileComplete,
    linkedStudent,
    pendingRequests
  };
};

// Past attendance for the linked student, grouped by course.
const getAttendance = async (user) => {
  const linked = user.studentId && isObjectId(String(user.studentId)) ? await Student.findById(user.studentId) : null;
  const rollNumber = linked?.rollNumber || user.profile?.rollNumber;

  // Only finalized sessions count: earlier ones still hold unreviewed AI guesses (including "needs review", which would otherwise be shown as...
  const allRecords = linked
    ? await AttendanceRecord.find({ studentId: linked._id })
        .populate('sessionId', 'date status courseId')
        .lean()
    : [];
  const records = allRecords.filter((record) => record.sessionId && record.sessionId.status === SESSION_STATUS.FINALIZED);

  const courseIds = [...new Set(records.map((record) => String(record.sessionId.courseId)))];
  const courses = await Course.find({ _id: { $in: courseIds } }).lean();
  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  const byCourse = new Map();
  for (const record of records) {
    const session = record.sessionId;
    const key = String(session.courseId);
    if (!byCourse.has(key)) {
      const course = courseById.get(key);
      byCourse.set(key, {
        courseId: key,
        courseCode: course?.courseCode || '—',
        courseName: course?.courseName || '—',
        present: 0,
        absent: 0,
        total: 0,
        sessions: []
      });
    }
    const entry = byCourse.get(key);
    entry.total += 1;
    if (record.status === RECORD_STATUS.PRESENT) entry.present += 1;
    else entry.absent += 1;
    entry.sessions.push({
      sessionId: session._id,
      date: session.date,
      status: record.status
    });
  }

  const total = records.length;
  const present = records.filter((record) => record.status === RECORD_STATUS.PRESENT).length;

  return {
    rollNumber,
    studentId: linked?._id || null,
    summary: {
      total,
      present,
      absent: total - present,
      percentage: total ? Math.round((present / total) * 10000) / 100 : 0
    },
    courses: [...byCourse.values()].map((entry) => ({
      ...entry,
      percentage: entry.total ? Math.round((entry.present / entry.total) * 10000) / 100 : 0
    }))
  };
};

const MAX_REFERENCE_EMBEDDINGS = 5;

// Append a reference vector to a student.
const appendEmbedding = async (student, embedding, model) => {
  await Student.updateOne(
    { _id: student._id },
    {
      $push: { faceEmbeddings: { $each: [embedding], $slice: -MAX_REFERENCE_EMBEDDINGS } },
      $set: { hasFaceEmbedding: true, ...(model ? { embeddingModel: model } : {}) }
    }
  );
  student.faceEmbeddings = [...(student.faceEmbeddings || []), embedding].slice(-MAX_REFERENCE_EMBEDDINGS);
  student.hasFaceEmbedding = true;
  if (model) student.embeddingModel = model;
  return student;
};

// Persist a small face thumbnail for each just-enrolled student, cropped from the classroom photo the face was detected in.
const storeFaceThumbnails = async (session, entries) => {
  if (!entries || entries.length === 0) return;
  const imageById = new Map((session.uploadedImages || []).map((image) => [String(image._id), image]));
  const groups = new Map();
  for (const entry of entries) {
    const image = imageById.get(String(entry.face.imageId));
    if (!image || !Array.isArray(entry.face.bbox) || entry.face.bbox.length !== 4) continue;
    const key = String(image._id);
    if (!groups.has(key)) groups.set(key, { image, entries: [] });
    groups.get(key).entries.push(entry);
  }

  for (const { image, entries: group } of groups.values()) {
    let buffer;
    try {
      buffer = await storageService.readFile(image.path);
    } catch {
      continue;
    }
    let crops;
    try {
      crops = await mlClient.cropFaces({
        buffer,
        filename: image.filename,
        mimeType: image.mimeType,
        boxes: group.map((entry) => entry.face.bbox)
      });
    } catch {
      continue;
    }
    for (let index = 0; index < group.length; index += 1) {
      const encoded = crops[index];
      if (!encoded) continue;
      const { student } = group[index];
      try {
        const stored = await storageService.writeBuffer(
          Buffer.from(encoded, 'base64'),
          'registered-faces',
          `${student._id}-`
        );
        const previous = student.registeredImage;
        await Student.updateOne({ _id: student._id }, { $set: { registeredImage: stored.relativePath } });
        student.registeredImage = stored.relativePath;
        // Only ever delete a thumbnail we wrote — never a profile/request photo.
        if (previous && previous !== stored.relativePath && previous.startsWith('registered-faces/')) {
          await storageService.removeStored(previous);
        }
      } catch {
        // Thumbnail is a convenience; the student stays enrolled without one.
      }
    }
  }
};

module.exports = {
  getByRef,
  assertCanView,
  list,
  getOne,
  create,
  update,
  deactivate,
  registerFace,
  generateEmbedding,
  listEnrolledForCourse,
  appendEmbedding,
  storeFaceThumbnails,
  buildProfile,
  getProfile,
  getAttendance,
  findInCourse,
  MAX_REFERENCE_EMBEDDINGS
};
