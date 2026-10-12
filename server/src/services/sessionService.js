const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Course = require('../models/Course');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const courseService = require('./courseService');
const storageService = require('./storageService');
const presenters = require('../utils/presenters');
const { toObjectId } = require('../utils/objectId');
const { parseDateOnly, todayDateOnly } = require('../utils/date');
const { SESSION_STATUS, ROLES, LIMITS, AUDIT_ACTIONS } = require('../config/constants');

const UPLOADABLE_STATUSES = [SESSION_STATUS.DRAFT, SESSION_STATUS.FAILED, SESSION_STATUS.REVIEW];

const getOwnedSession = async (id, user, { allowAdmin = false } = {}) => {
  const session = await AttendanceSession.findById(toObjectId(id, 'session id'));
  if (!session) throw new AppError('Attendance session not found', 404, { code: 'SESSION_NOT_FOUND' });
  const isOwner = session.professorId.equals(user._id);
  const isAllowedAdmin = allowAdmin && user.role === ROLES.ADMIN;
  if (!isOwner && !isAllowedAdmin) {
    throw new AppError('You are not authorized for this attendance session', 403, { code: 'FORBIDDEN' });
  }
  return session;
};

const assertNotFinalized = (session) => {
  if (session.status === SESSION_STATUS.FINALIZED) {
    throw new AppError('Attendance session is already finalized', 409, { code: 'SESSION_FINALIZED' });
  }
};

const assertUploadable = (session) => {
  assertNotFinalized(session);
  if (!UPLOADABLE_STATUSES.includes(session.status)) {
    throw new AppError(`Session cannot accept images while ${session.status}`, 409, { code: 'SESSION_BUSY' });
  }
};

const getUploadableSession = async (id, user) => {
  const session = await getOwnedSession(id, user);
  assertUploadable(session);
  return session;
};

const createSession = async (user, { courseId, date }) => {
  const course = await courseService.getById(courseId);
  if (!course.professorId.equals(user._id)) {
    throw new AppError('You are not assigned to this course', 403, { code: 'FORBIDDEN' });
  }
  const sessionDate = date ? parseDateOnly(date) : todayDateOnly();

  const existing = await AttendanceSession.findOne({
    courseId: course._id,
    date: sessionDate,
    status: { $ne: SESSION_STATUS.FAILED }
  }).select('status');
  if (existing) {
    throw new AppError('Attendance already exists for this course and date', 409, {
      code: 'DUPLICATE_ATTENDANCE',
      details: { sessionId: existing._id, status: existing.status }
    });
  }

  const session = await AttendanceSession.create({
    courseId: course._id,
    professorId: user._id,
    date: sessionDate,
    status: SESSION_STATUS.DRAFT
  });
  await auditService.record(
    auditService.userEntry(user, { sessionId: session._id, action: AUDIT_ACTIONS.SESSION_CREATED })
  );
  return presenters.session(session, course);
};

const addImages = async (id, user, files) => {
  if (!files || files.length === 0) {
    throw new AppError('At least one image is required in the "images" field', 400, { code: 'INVALID_UPLOAD' });
  }
  const session = await getUploadableSession(id, user);

  if (session.uploadedImages.length + files.length > LIMITS.IMAGES_PER_SESSION) {
    await storageService.removeFiles(files.map((file) => file.path));
    throw new AppError(`A session can hold at most ${LIMITS.IMAGES_PER_SESSION} images`, 409, {
      code: 'IMAGE_LIMIT_REACHED'
    });
  }

  const stored = await storageService.commitUploads(files, `attendance-images/${session._id}`);
  const images = stored.map((file) => ({
    filename: file.filename,
    path: file.relativePath,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size
  }));

  let updated;
  try {
    updated = await AttendanceSession.findOneAndUpdate(
      { _id: session._id, status: { $in: UPLOADABLE_STATUSES } },
      { $push: { uploadedImages: { $each: images } } },
      { new: true }
    );
  } catch (error) {
    await storageService.removeFiles(stored.map((file) => file.absolutePath));
    throw error;
  }
  if (!updated) {
    await storageService.removeFiles(stored.map((file) => file.absolutePath));
    throw new AppError('Session can no longer accept images', 409, { code: 'SESSION_BUSY' });
  }

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      action: AUDIT_ACTIONS.IMAGES_UPLOADED,
      after: { count: images.length }
    })
  );
  return presenters.session(updated);
};

const buildReview = async (session) => {
  const [course, records] = await Promise.all([
    Course.findById(session.courseId).lean(),
    AttendanceRecord.find({ sessionId: session._id }).populate('studentId', 'studentId rollNumber name').lean()
  ]);
  records.sort((a, b) =>
    String(a.studentId.rollNumber).localeCompare(String(b.studentId.rollNumber), undefined, { numeric: true })
  );
  const warnings = (session.analysis && session.analysis.warnings) || [];
  return {
    session: presenters.session(session, course),
    records: records.map(presenters.record),
    warnings
  };
};

const getReview = async (id, user) => buildReview(await getOwnedSession(id, user, { allowAdmin: true }));

module.exports = {
  getOwnedSession,
  assertNotFinalized,
  getUploadableSession,
  createSession,
  addImages,
  buildReview,
  getReview
};
