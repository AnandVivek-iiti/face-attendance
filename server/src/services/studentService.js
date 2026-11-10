const Student = require('../models/Student');
const Course = require('../models/Course');
const EnrollmentRequest = require('../models/EnrollmentRequest');
const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const mlClient = require('./mlClient');
const fs = require('fs');
const storageService = require('./storageService');
const registeredFaceStore = require('./registeredFaceStore');
const { detectImageType } = require('../utils/fileSignature');
const env = require('../config/env');
const CourseEnrollment = require('../models/CourseEnrollment');
const courseEnrollmentService = require('./courseEnrollmentService');
const auditService = require('./auditService');
const { isObjectId } = require('../utils/objectId');
const { skipFor, toPagination } = require('../utils/pagination');
const { ROLES, ENROLLMENT_REQUEST_STATUS, AUDIT_ACTIONS, RECORD_STATUS, SESSION_STATUS, ML_DECISION } = require('../config/constants');

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
  // A professor sees only students enrolled in a course they teach.
  if (user.role === ROLES.PROFESSOR && (await courseEnrollmentService.professorTeachesStudent(user, student._id))) return;
  throw new AppError('You are not authorized to view this student', 403, { code: 'FORBIDDEN' });
};

// Show which of the visible courses each student is in, so the client can label rows by course code.
const attachCourses = async (students, courseScope) => {
  if (students.length === 0) return [];
  const filter = { studentId: { $in: students.map((student) => student._id) }, active: true };
  if (courseScope) filter.courseId = { $in: courseScope };
  const rows = await CourseEnrollment.find(filter).populate('courseId', 'courseCode courseName section').lean();
  const byStudent = new Map();
  for (const row of rows) {
    if (!row.courseId) continue;
    const key = String(row.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push({
      id: row.courseId._id,
      courseCode: row.courseId.courseCode,
      courseName: row.courseId.courseName,
      section: row.courseId.section ?? null
    });
  }
  return students.map((student) => ({ ...student.toJSON(), courses: byStudent.get(String(student._id)) || [] }));
};

const list = async (user, query) => {
  const conditions = [];

  // Course enrollment decides visibility: a professor sees only students enrolled in the course(s) they teach.
  const courseScope = await courseEnrollmentService.resolveCourseScope(user, query);
  if (courseScope) {
    const visibleIds = await courseEnrollmentService.studentIdsInCourses(courseScope);
    if (visibleIds.length === 0) return { students: [], pagination: toPagination(query, 0) };
    conditions.push({ _id: { $in: visibleIds } });
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
  const visible = await attachCourses(students, courseScope);
  return { students: visible, pagination: toPagination(query, total) };
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

const ownedFilePaths = (paths) =>
  paths.filter(
    (value) =>
      typeof value === 'string' && (value.startsWith('registered-faces/') || value.startsWith('profile-images/'))
  );

const remove = async (ref) => {
  const recordService = require('./recordService');
  const student = await getByRef(ref);

  const enrolledCourseIds = await courseEnrollmentService.courseIdsForStudent(student._id);
  if (enrolledCourseIds.length) {
    const busy = await AttendanceSession.exists({
      courseId: { $in: enrolledCourseIds },
      status: SESSION_STATUS.PROCESSING
    });
    if (busy) {
      throw new AppError('Attendance analysis is running for this student\'s course. Try again when it finishes.', 409, {
        code: 'ANALYSIS_IN_PROGRESS'
      });
    }
  }

  const sessionIds = await AttendanceRecord.distinct('sessionId', { studentId: student._id });
  const { deletedCount: recordsRemoved } = await AttendanceRecord.deleteMany({ studentId: student._id });
  await Promise.all(sessionIds.map((sessionId) => recordService.refreshSessionCounts(sessionId)));

  await AttendanceSession.updateMany(
    { 'analysis.faces.studentId': student.studentId },
    {
      $set: {
        'analysis.faces.$[face].studentId': null,
        'analysis.faces.$[face].similarity': null,
        'analysis.faces.$[face].decision': ML_DECISION.UNKNOWN
      }
    },
    { arrayFilters: [{ 'face.studentId': student.studentId }] }
  );

  const photoPaths = [student.registeredImage];
  const gridFsPhotoIds = [student.registeredImageFileId, ...(student.registeredFaceImages || []).map((entry) => entry.fileId)].filter(Boolean);
  const thumbnailId = student.faceThumbnailFileId;
  const linkedUsers = await User.find({ studentId: String(student._id) }).select('_id').lean();
  if (linkedUsers.length) {
    const userIds = linkedUsers.map((user) => user._id);
    await User.updateMany(
      { _id: { $in: userIds } },
      {
        $unset: { studentId: 1 },
        $set: { 'profile.rollNumber': null, 'profile.year': null, 'profile.semester': null, 'profile.department': null }
      }
    );
    const requests = await EnrollmentRequest.find({ userId: { $in: userIds }, rollNumber: student.rollNumber })
      .select('imagePath')
      .lean();
    if (requests.length) {
      await EnrollmentRequest.deleteMany({ _id: { $in: requests.map((request) => request._id) } });
      photoPaths.push(...requests.map((request) => request.imagePath));
    }
  }

  await CourseEnrollment.deleteMany({ studentId: student._id });
  await Student.deleteOne({ _id: student._id });
  await Promise.allSettled([
    ...ownedFilePaths(photoPaths).map((relativePath) => storageService.removeStored(relativePath)),
    // A deleted student keeps no data: every GridFS photo goes too (de-duplicated, the current one is also in the history).
    ...[...new Set(gridFsPhotoIds.map(String))].map((id) => registeredFaceStore.remove(id)),
    registeredFaceStore.thumbnails.remove(thumbnailId)
  ]);

  return { deleted: true, id: String(student._id), studentId: student.studentId, recordsRemoved };
};

const MAX_PHOTO_HISTORY = 3;
const mimeFromName = (name) => {
  const lower = String(name || '').toLowerCase();
  return lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
};

// The student's registered photograph: GridFS first, then the legacy filesystem path (not yet migrated). Never any other source.
const readRegisteredPhoto = async (student) => {
  if (student.registeredImageFileId) {
    const file = await registeredFaceStore.getFile(student.registeredImageFileId);
    return { buffer: file.buffer, filename: file.filename, mimeType: file.mimeType, from: 'gridfs' };
  }
  if (student.registeredImage) {
    const buffer = await storageService.readFile(student.registeredImage);
    const filename = student.registeredImage.split('/').pop();
    return { buffer, filename, mimeType: mimeFromName(filename), from: 'legacy' };
  }
  throw new AppError('Register a face image before generating an embedding', 409, { code: 'NO_REGISTERED_IMAGE' });
};

// Store a new registered photograph in GridFS and point the student at it. The previous photo is only deleted AFTER the new one is
// stored, verified and referenced. `embedding` (when given) replaces every stored reference vector: they were produced from the old
// photo (or from classroom crops of an unverified identity), so they must not survive as if they described the new one.
const attachRegisteredPhoto = async (student, { buffer, filename, source, embedding = null }) => {
  const stored = await registeredFaceStore.store({ buffer, filename, studentId: student.studentId, source });
  const current = await Student.findById(student._id).select('registeredImageFileId registeredFaceImages registeredImage').lean();
  const history = [...((current && current.registeredFaceImages) || []), {
    fileId: stored.fileId, filename: stored.filename, mimeType: stored.mimeType, size: stored.size, source, uploadedAt: new Date()
  }];
  const kept = history.slice(-MAX_PHOTO_HISTORY);
  const evicted = history.slice(0, history.length - kept.length);

  const $set = { registeredImageFileId: stored.fileId, registeredFaceImages: kept };
  if (embedding) {
    $set.faceEmbeddings = [embedding.vector];
    $set.embeddingModel = embedding.model;
    $set.hasFaceEmbedding = true;
  } else {
    $set.faceEmbeddings = [];
    $set.embeddingModel = null;
    $set.hasFaceEmbedding = false;
  }
  let result;
  try {
    // Optimistic guard: only apply if nobody replaced the photo meanwhile.
    result = await Student.updateOne(
      { _id: student._id, registeredImageFileId: (current && current.registeredImageFileId) || null },
      { $set }
    );
  } catch (error) {
    await registeredFaceStore.remove(stored.fileId).catch(() => {});
    throw error;
  }
  if (result.matchedCount === 0) {
    await registeredFaceStore.remove(stored.fileId).catch(() => {});
    throw new AppError('The registered photo was changed by someone else; try again', 409, { code: 'PHOTO_CONFLICT' });
  }
  await Promise.allSettled(evicted.map((entry) => registeredFaceStore.remove(entry.fileId)));
  return stored;
};

const registerFace = async (ref, files) => {
  if (!files || files.length !== 1) {
    throw new AppError('Exactly one image is required in the "image" field', 400, { code: 'INVALID_UPLOAD' });
  }
  const [file] = files;
  try {
    const student = await getByRef(ref);
    const buffer = await fs.promises.readFile(file.path);
    if (!detectImageType(buffer)) throw new AppError(`"${file.originalname}" is not a valid JPEG, PNG or WebP image`, 400, { code: 'INVALID_FILE_TYPE' });

    // The ML service must find exactly one usable face BEFORE anything is replaced, so a bad upload can never overwrite a good photo.
    const embedded = await mlClient.generateEmbedding({ buffer, filename: file.originalname, mimeType: detectImageType(buffer) });
    await attachRegisteredPhoto(student, {
      buffer,
      filename: file.originalname,
      source: 'admin-upload',
      embedding: { vector: embedded.embedding, model: embedded.embeddingModel }
    });
    // The superseded filesystem copy (if any) is no longer referenced; the GridFS file is now the source of truth.
    if (student.registeredImage) {
      await Student.updateOne({ _id: student._id }, { $set: { registeredImage: null } });
      await storageService.removeStored(student.registeredImage).catch((error) => console.error('Could not remove legacy photo', error.message));
    }
    return await Student.findById(student._id);
  } finally {
    await storageService.removeFiles([file.path]).catch(() => {});
  }
};

// Rebuild the reference vector from the registered photograph (e.g. after an ML model change).
const generateEmbedding = async (ref) => {
  const student = await getByRef(ref);
  const photo = await readRegisteredPhoto(student);
  const result = await mlClient.generateEmbedding({ buffer: photo.buffer, filename: photo.filename, mimeType: photo.mimeType });

  await Student.updateOne(
    { _id: student._id },
    { $set: { faceEmbeddings: [result.embedding], embeddingModel: result.embeddingModel, hasFaceEmbedding: true } }
  );
  const updated = await Student.findById(student._id);
  return { student: updated, embeddingSize: result.embedding.length, faceQuality: result.faceQuality ?? null };
};

// The roster is the students enrolled in this course, whatever their semester, section or department.
const listEnrolledForCourse = (course) => courseEnrollmentService.listRoster(course, { withEmbeddings: true });

// Is this roll number already enrolled in this course?
const findInCourse = async (rollNumber, course) => {
  const student = await Student.findOne({ rollNumber, active: true });
  if (!student) return null;
  return (await courseEnrollmentService.isEnrolled(course._id, student._id)) ? student : null;
};

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

const { MAX_REFERENCE_EMBEDDINGS, nextReferences, decideAssignmentEmbedding } = require('../utils/referenceEmbeddings');

// Append a reference vector to a student.
const appendEmbedding = async (student, embedding, model) => {
  const modelChanged = Boolean(model && student.embeddingModel && student.embeddingModel !== model);
  if (modelChanged) {
    await Student.updateOne(
      { _id: student._id },
      { $set: { faceEmbeddings: [embedding], embeddingModel: model, hasFaceEmbedding: true } }
    );
    student.faceEmbeddings = [embedding];
  } else {
    // Skip near-duplicates and keep the first (enrolment) reference when the cap is reached.
    const stored = await Student.findById(student._id).select('+faceEmbeddings').lean();
    const next = nextReferences((stored && stored.faceEmbeddings) || [], embedding);
    await Student.updateOne(
      { _id: student._id },
      { $set: { faceEmbeddings: next, hasFaceEmbedding: true, ...(model ? { embeddingModel: model } : {}) } }
    );
    student.faceEmbeddings = next;
  }
  student.hasFaceEmbedding = true;
  if (model) student.embeddingModel = model;
  return student;
};

// A professor's face assignment may add that classroom face to the student's reference vectors, but only under the rules in
// decideAssignmentEmbedding (bootstrap, or explicit opt-in plus an ML-suggested match above the similarity floor).
const appendAssignmentEmbedding = async (student, face, model) => {
  const current = await Student.findById(student._id)
    .select('+faceEmbeddings embeddingModel registeredImage registeredImageFileId')
    .lean();
  const decision = decideAssignmentEmbedding({
    student: {
      embeddingModel: current && current.embeddingModel,
      faceEmbeddings: (current && current.faceEmbeddings) || [],
      hasRegisteredPhoto: Boolean(current && (current.registeredImageFileId || current.registeredImage))
    },
    face: { studentId: face.studentId ?? null, similarity: face.similarity ?? null },
    assignedStudentId: student.studentId,
    sessionModel: model,
    optIn: env.assignAppendsEmbedding,
    minSimilarity: env.assignAppendMinSimilarity
  });
  if (decision.action === 'append') await appendEmbedding(student, face.embedding, model);
  return decision;
};

// A small face thumbnail for a just-enrolled student who has NO registered photograph. It lives in its own GridFS bucket and never
// replaces or deletes a registered photograph: a classroom crop is not an original registered portrait.
const storeFaceThumbnails = async (session, entries) => {
  if (!entries || entries.length === 0) return;
  const imageById = new Map((session.uploadedImages || []).map((image) => [String(image._id), image]));
  const groups = new Map();
  for (const entry of entries) {
    const image = imageById.get(String(entry.face.imageId));
    if (!image || !Array.isArray(entry.face.bbox) || entry.face.bbox.length !== 4) continue;
    const current = await Student.findById(entry.student._id).select('registeredImage registeredImageFileId faceThumbnailFileId').lean();
    if (!current || current.registeredImage || current.registeredImageFileId || current.faceThumbnailFileId) continue;
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
      crops = await mlClient.cropFaces({ buffer, filename: image.filename, mimeType: image.mimeType, boxes: group.map((entry) => entry.face.bbox) });
    } catch {
      continue;
    }
    for (let index = 0; index < group.length; index += 1) {
      const encoded = crops[index];
      if (!encoded) continue;
      const { student } = group[index];
      try {
        const stored = await registeredFaceStore.thumbnails.store({
          buffer: Buffer.from(encoded, 'base64'),
          filename: `${student._id}-thumb.jpg`,
          studentId: student.studentId,
          source: 'classroom-crop'
        });
        // Only set it if still empty, so two concurrent assignments cannot orphan a file.
        const result = await Student.updateOne({ _id: student._id, faceThumbnailFileId: null }, { $set: { faceThumbnailFileId: stored.fileId } });
        if (result.matchedCount === 0) await registeredFaceStore.thumbnails.remove(stored.fileId);
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
  remove,
  registerFace,
  generateEmbedding,
  listEnrolledForCourse,
  appendEmbedding,
  appendAssignmentEmbedding,
  attachRegisteredPhoto,
  readRegisteredPhoto,
  storeFaceThumbnails,
  buildProfile,
  getProfile,
  getAttendance,
  findInCourse,
  MAX_REFERENCE_EMBEDDINGS
};
