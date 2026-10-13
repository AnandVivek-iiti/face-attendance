const EnrollmentRequest = require('../models/EnrollmentRequest');
const Student = require('../models/Student');
const Course = require('../models/Course');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const mlClient = require('./mlClient');
const storageService = require('./storageService');
const studentService = require('./studentService');
const { ENROLLMENT_REQUEST_STATUS, AUDIT_ACTIONS } = require('../config/constants');

const findOwnedRequest = async (id, user) => {
  const request = await EnrollmentRequest.findById(id);
  if (!request) throw new AppError('Enrollment request not found', 404, { code: 'REQUEST_NOT_FOUND' });
  const course = await Course.findById(request.courseId);
  if (!course || !course.professorId.equals(user._id)) {
    throw new AppError('You are not the professor for this course', 403, { code: 'FORBIDDEN' });
  }
  return { request, course };
};

/** Pending requests across every course the professor owns. */
const listForProfessor = async (user) => {
  const courses = await Course.find({ professorId: user._id }).select('courseCode courseName').lean();
  if (!courses.length) return [];
  const courseIds = courses.map((course) => course._id);
  const courseById = new Map(courses.map((course) => [String(course._id), course]));

  const requests = await EnrollmentRequest.find({
    courseId: { $in: courseIds },
    status: ENROLLMENT_REQUEST_STATUS.PENDING
  })
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  return requests.map((request) => ({
    id: request._id,
    rollNumber: request.rollNumber,
    name: request.name,
    year: request.year,
    semester: request.semester,
    department: request.department,
    imagePath: request.imagePath,
    status: request.status,
    createdAt: request.createdAt,
    course: courseById.get(String(request.courseId))
  }));
};

const embedImage = async (imagePath) => {
  const buffer = await storageService.readFile(imagePath);
  const filename = imagePath.split('/').pop();
  const mimeType = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return mlClient.generateEmbedding({ buffer, filename, mimeType });
};

/**
 * Approve: turn the request photo into a real roster entry. The embedding is
 * derived here so the student can be matched from the very first classroom
 * photograph — they never need a separate registration photo later.
 */
const approve = async (id, user, note) => {
  const { request, course } = await findOwnedRequest(id, user);
  if (request.status !== ENROLLMENT_REQUEST_STATUS.PENDING) {
    throw new AppError('This request has already been reviewed', 409, { code: 'ALREADY_REVIEWED' });
  }

  let embedding;
  try {
    const generated = await embedImage(request.imagePath);
    embedding = generated.embedding;
  } catch (error) {
    throw new AppError('Could not read a face from that photo. Ask the student to upload a clearer one.', 422, {
      code: 'FACE_EMBEDDING_FAILED'
    });
  }

  let student = await Student.findOne({ rollNumber: request.rollNumber });
  if (student) {
    // Already on some roster: move them into this course's cohort.
    student.semester = course.semester;
    student.section = course.section;
    student.department = request.department || student.department;
    student.name = request.name || student.name;
    student.active = true;
    await student.save();
    await studentService.appendEmbedding(student, embedding, null);
  } else {
    student = await Student.create({
      studentId: request.rollNumber,
      rollNumber: request.rollNumber,
      name: request.name,
      department: request.department,
      semester: course.semester,
      section: course.section,
      faceEmbeddings: [embedding],
      embeddingModel: null,
      hasFaceEmbedding: true
    });
  }

  await User.updateOne({ _id: request.userId }, { $set: { studentId: student._id } });

  request.status = ENROLLMENT_REQUEST_STATUS.APPROVED;
  request.reviewedBy = user._id;
  request.reviewedAt = new Date();
  request.note = note || null;
  await request.save();

  await auditService.record(
    auditService.userEntry(user, {
      action: AUDIT_ACTIONS.ENROLLMENT_APPROVED,
      after: { requestId: request._id, rollNumber: request.rollNumber, courseId: course._id }
    })
  );

  return { request: request.toJSON(), student: student.toJSON ? student.toJSON() : student };
};

const reject = async (id, user, note) => {
  const { request, course } = await findOwnedRequest(id, user);
  if (request.status !== ENROLLMENT_REQUEST_STATUS.PENDING) {
    throw new AppError('This request has already been reviewed', 409, { code: 'ALREADY_REVIEWED' });
  }
  request.status = ENROLLMENT_REQUEST_STATUS.REJECTED;
  request.reviewedBy = user._id;
  request.reviewedAt = new Date();
  request.note = note || 'Not approved';
  await request.save();

  await auditService.record(
    auditService.userEntry(user, {
      action: AUDIT_ACTIONS.ENROLLMENT_REJECTED,
      after: { requestId: request._id, rollNumber: request.rollNumber, courseId: course._id }
    })
  );

  return { request: request.toJSON() };
};

/** A student's own request statuses, so they can see where they stand. */
const listForStudent = async (user) =>
  EnrollmentRequest.find({ userId: user._id })
    .populate('courseId', 'courseCode courseName')
    .sort({ createdAt: -1 })
    .lean();

module.exports = { listForProfessor, approve, reject, listForStudent };
