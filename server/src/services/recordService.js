const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const AppError = require('../utils/AppError');
const courseService = require('./courseService');
const auditService = require('./auditService');
const sessionService = require('./sessionService');
const studentService = require('./studentService');
const presenters = require('../utils/presenters');
const { RECORD_STATUS, RECORD_SOURCE, SESSION_STATUS, AUDIT_ACTIONS } = require('../config/constants');

const tally = async (sessionId) => {
  const rows = await AttendanceRecord.aggregate([
    { $match: { sessionId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const counts = {
    presentCount: byStatus[RECORD_STATUS.PRESENT] || 0,
    absentCount: byStatus[RECORD_STATUS.ABSENT] || 0,
    needsReviewCount: byStatus[RECORD_STATUS.NEEDS_REVIEW] || 0
  };
  counts.totalStudents = counts.presentCount + counts.absentCount + counts.needsReviewCount;
  return counts;
};

const refreshSessionCounts = async (sessionId) => {
  const counts = await tally(sessionId);
  await AttendanceSession.updateOne({ _id: sessionId }, { $set: counts });
  return counts;
};

const assertEditable = (session) => {
  sessionService.assertNotFinalized(session);
  if (session.status !== SESSION_STATUS.REVIEW) {
    throw new AppError(`Records cannot be edited while the session is ${session.status}`, 409, {
      code: 'SESSION_NOT_IN_REVIEW'
    });
  }
};

const snapshot = (record) => ({
  status: record.status,
  source: record.source,
  confidence: record.confidence,
  aiStudentId: record.aiStudentId
});

const markReviewed = (record, source) => {
  record.source = source;
  record.reviewedByProfessor = true;
  record.reviewedAt = new Date();
};

const presentRecord = async (record) => {
  await record.populate('studentId', 'studentId rollNumber name');
  return presenters.record(record);
};

const changeStatus = async (session, record, student, user, body) => {
  const before = snapshot(record);
  const aiInvolved = Boolean(record.aiStudentId);
  record.status = body.status ?? record.status;
  if (body.ignored !== undefined) record.ignored = body.ignored;
  markReviewed(record, aiInvolved ? RECORD_SOURCE.AI_REVIEWED : RECORD_SOURCE.MANUAL);
  await record.save();

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      studentId: student._id,
      action: before.status === record.status ? AUDIT_ACTIONS.RECORD_CONFIRMED : AUDIT_ACTIONS.RECORD_STATUS_CHANGED,
      before,
      after: snapshot(record),
      note: body.note || null
    })
  );
  const summary = await refreshSessionCounts(session._id);
  return { record: await presentRecord(record), relatedRecord: null, summary };
};

const updateRecord = async (sessionId, studentRef, user, body) => {
  const session = await sessionService.getOwnedSession(sessionId, user);
  assertEditable(session);
  const student = await studentService.getByRef(studentRef);
  let record = await AttendanceRecord.findOne({ sessionId: session._id, studentId: student._id });
  let isNew = false;
  if (!record) {
    // A student added to the roster during review has no record yet. Create one
    // so the professor's manual mark persists. It must still be a student of
    // this course's cohort: otherwise a professor could put anyone on a class.
    const course = await courseService.getById(session.courseId);
    if (!student.active || student.semester !== course.semester || student.section !== course.section) {
      throw new AppError('That student is not enrolled in this course', 409, { code: 'STUDENT_NOT_IN_COURSE' });
    }
    record = new AttendanceRecord({
      sessionId: session._id,
      studentId: student._id,
      status: body.status ?? RECORD_STATUS.ABSENT,
      source: RECORD_SOURCE.MANUAL
    });
    isNew = true;
  }
  const result = await changeStatus(session, record, student, user, body);
  // changeStatus recounts from the database, so the totals already include the
  // new record; nothing else to adjust.
  return isNew ? { ...result, created: true } : result;
};

module.exports = { tally, refreshSessionCounts, updateRecord };
