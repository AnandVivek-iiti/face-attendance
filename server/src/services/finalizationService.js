const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const recordService = require('./recordService');
const sessionService = require('./sessionService');
const { SESSION_STATUS, RECORD_STATUS, AUDIT_ACTIONS } = require('../config/constants');

const FINAL_STATUSES = [RECORD_STATUS.PRESENT, RECORD_STATUS.ABSENT];

const finalizeSession = async (id, user) => {
  const session = await sessionService.getOwnedSession(id, user);
  sessionService.assertNotFinalized(session);
  if (session.status !== SESSION_STATUS.REVIEW) {
    throw new AppError(`Session cannot be finalized while ${session.status}`, 409, { code: 'SESSION_NOT_IN_REVIEW' });
  }

  const records = await AttendanceRecord.find({ sessionId: session._id })
    .populate('studentId', 'studentId')
    .select('status studentId')
    .lean();
  if (records.length === 0) {
    throw new AppError('Session has no attendance records', 409, { code: 'NO_RECORDS' });
  }

  const pending = records.filter((record) => !FINAL_STATUSES.includes(record.status));
  if (pending.length > 0) {
    throw new AppError('All records marked for review must be resolved before finalizing', 409, {
      code: 'REVIEW_PENDING',
      details: { pendingStudentIds: pending.map((record) => record.studentId?.studentId ?? null) }
    });
  }

  const counts = await recordService.tally(session._id);
  if (counts.totalStudents !== records.length || counts.totalStudents !== session.totalStudents) {
    throw new AppError('Attendance records are inconsistent; run analysis again', 409, { code: 'INCONSISTENT_RECORDS' });
  }

  const finalized = await AttendanceSession.findOneAndUpdate(
    { _id: session._id, status: SESSION_STATUS.REVIEW },
    { $set: { ...counts, status: SESSION_STATUS.FINALIZED, finalizedAt: new Date(), finalizedBy: user._id } },
    { new: true }
  );
  if (!finalized) {
    throw new AppError('Attendance session is already finalized', 409, { code: 'SESSION_FINALIZED' });
  }

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      action: AUDIT_ACTIONS.SESSION_FINALIZED,
      after: counts
    })
  );
  return sessionService.buildReview(finalized);
};

module.exports = { finalizeSession };
