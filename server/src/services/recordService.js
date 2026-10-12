const AttendanceRecord = require('../models/AttendanceRecord');
const AttendanceSession = require('../models/AttendanceSession');
const AppError = require('../utils/AppError');
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
  record.status = body.status;
  markReviewed(record, aiInvolved ? RECORD_SOURCE.AI_REVIEWED : RECORD_SOURCE.MANUAL);
  await record.save();

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      studentId: student._id,
      action: before.status === body.status ? AUDIT_ACTIONS.RECORD_CONFIRMED : AUDIT_ACTIONS.RECORD_STATUS_CHANGED,
      before,
      after: snapshot(record),
      note: body.note || null
    })
  );
  const summary = await refreshSessionCounts(session._id);
  return { record: await presentRecord(record), relatedRecord: null, summary };
};

const reassign = async (session, record, student, user, body) => {
  const target = await studentService.getByRef(body.reassignTo);
  if (target._id.equals(student._id)) {
    throw new AppError('Cannot reassign a record to the same student', 400, { code: 'INVALID_REASSIGNMENT' });
  }
  if (!record.evidence || record.evidence.length === 0) {
    throw new AppError('This record has no AI-detected face to reassign', 422, { code: 'NOT_REASSIGNABLE' });
  }
  const targetRecord = await AttendanceRecord.findOne({ sessionId: session._id, studentId: target._id });
  if (!targetRecord) {
    throw new AppError('Target student is not part of this attendance session', 404, { code: 'RECORD_NOT_FOUND' });
  }

  const beforeSource = snapshot(record);
  const beforeTarget = snapshot(targetRecord);

  targetRecord.evidence = [...targetRecord.evidence.map((item) => item.toObject()), ...record.evidence.map((item) => item.toObject())];
  if (targetRecord.confidence == null) {
    targetRecord.confidence = record.confidence;
    targetRecord.faceQuality = record.faceQuality;
  }
  targetRecord.aiStudentId = targetRecord.aiStudentId || record.aiStudentId;
  targetRecord.status = RECORD_STATUS.PRESENT;
  markReviewed(targetRecord, RECORD_SOURCE.AI_REVIEWED);

  record.evidence = [];
  record.confidence = null;
  record.faceQuality = null;
  record.status = RECORD_STATUS.ABSENT;
  markReviewed(record, RECORD_SOURCE.AI_REVIEWED);

  await record.save();
  await targetRecord.save();

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      studentId: student._id,
      action: AUDIT_ACTIONS.IDENTITY_CHANGED,
      before: { from: { studentId: student.studentId, ...beforeSource }, to: { studentId: target.studentId, ...beforeTarget } },
      after: { from: { studentId: student.studentId, ...snapshot(record) }, to: { studentId: target.studentId, ...snapshot(targetRecord) } },
      note: body.note || null
    })
  );
  const summary = await refreshSessionCounts(session._id);
  return {
    record: await presentRecord(record),
    relatedRecord: await presentRecord(targetRecord),
    summary
  };
};

const updateRecord = async (sessionId, studentRef, user, body) => {
  const session = await sessionService.getOwnedSession(sessionId, user);
  assertEditable(session);
  const student = await studentService.getByRef(studentRef);
  const record = await AttendanceRecord.findOne({ sessionId: session._id, studentId: student._id });
  if (!record) {
    throw new AppError('Student is not part of this attendance session', 404, { code: 'RECORD_NOT_FOUND' });
  }
  if (body.reassignTo !== undefined) return reassign(session, record, student, user, body);
  return changeStatus(session, record, student, user, body);
};

module.exports = { tally, refreshSessionCounts, updateRecord };
