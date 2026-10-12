const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const AppError = require('../utils/AppError');
const studentService = require('./studentService');
const presenters = require('../utils/presenters');
const { toObjectId } = require('../utils/objectId');
const { parseDateOnly } = require('../utils/date');
const { skipFor, toPagination } = require('../utils/pagination');
const { ROLES, SESSION_STATUS, RECORD_STATUS } = require('../config/constants');

const dateRange = (query) => {
  if (!query.from && !query.to) return null;
  const range = {};
  if (query.from) range.$gte = parseDateOnly(query.from);
  if (query.to) range.$lte = parseDateOnly(query.to);
  return range;
};

const listSessions = async (user, query) => {
  const filter = {};
  if (user.role === ROLES.PROFESSOR) filter.professorId = user._id;
  if (query.courseId) filter.courseId = toObjectId(query.courseId, 'course id');
  if (query.status) filter.status = query.status;
  const range = dateRange(query);
  if (range) filter.date = range;

  const [sessions, total] = await Promise.all([
    AttendanceSession.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skipFor(query))
      .limit(query.limit)
      .populate('courseId', 'courseCode courseName semester section')
      .lean(),
    AttendanceSession.countDocuments(filter)
  ]);
  return {
    sessions: sessions.map((session) => presenters.sessionSummary(session)),
    pagination: toPagination(query, total)
  };
};

const resolveTargetStudent = async (user, query) => {
  if (user.role === ROLES.STUDENT) {
    if (!user.studentId) {
      throw new AppError('No student profile is linked to this account', 403, { code: 'FORBIDDEN' });
    }
    const own = await studentService.getByRef(user.studentId);
    if (query.studentId) {
      const requested = await studentService.getByRef(query.studentId);
      if (!requested._id.equals(own._id)) {
        throw new AppError('You can only view your own attendance', 403, { code: 'FORBIDDEN' });
      }
    }
    return own;
  }
  return query.studentId ? studentService.getByRef(query.studentId) : null;
};

const listStudentRecords = async (user, query, student) => {
  if (query.status) {
    throw new AppError('The status filter is not supported when viewing a student', 400, { code: 'INVALID_FILTER' });
  }

  const studentRecords = await AttendanceRecord.find({ studentId: student._id })
    .select('sessionId status')
    .lean();
  const statusBySession = new Map(studentRecords.map((record) => [String(record.sessionId), record.status]));

  const sessionFilter = {
    _id: { $in: studentRecords.map((record) => record.sessionId) },
    status: SESSION_STATUS.FINALIZED
  };
  if (user.role === ROLES.PROFESSOR) sessionFilter.professorId = user._id;
  if (query.courseId) sessionFilter.courseId = toObjectId(query.courseId, 'course id');
  const range = dateRange(query);
  if (range) sessionFilter.date = range;

  const sessions = await AttendanceSession.find(sessionFilter)
    .select('courseId date')
    .populate('courseId', 'courseCode courseName')
    .sort({ date: -1 })
    .lean();

  const all = sessions.map((session) => ({
    sessionId: session._id,
    status: statusBySession.get(String(session._id)),
    date: session.date,
    course: {
      id: session.courseId._id,
      courseCode: session.courseId.courseCode,
      courseName: session.courseId.courseName
    }
  }));

  const total = all.length;
  const present = all.filter((item) => item.status === RECORD_STATUS.PRESENT).length;
  const offset = skipFor(query);
  return {
    student: presenters.student(student),
    records: all.slice(offset, offset + query.limit),
    summary: {
      total,
      present,
      absent: total - present,
      percentage: total ? Math.round((present / total) * 10000) / 100 : 0
    },
    pagination: toPagination(query, total)
  };
};

const getHistory = async (user, query) => {
  const student = await resolveTargetStudent(user, query);
  return student ? listStudentRecords(user, query, student) : listSessions(user, query);
};

module.exports = { getHistory };
