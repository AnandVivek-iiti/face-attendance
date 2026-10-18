const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const courseService = require('./courseService');
const sessionService = require('./sessionService');
const { toObjectId } = require('../utils/objectId');
const { SESSION_STATUS } = require('../config/constants');

const COLUMNS = ['Roll Number', 'Name', 'Status', 'Course', 'Date'];

// Spreadsheet programs run any cell that starts with = + - @ (or a tab / CR) as a formula.
const neutralizeFormula = (text) => (/^(\s*[=+\-@]|[\t\r])/.test(text) ? `'${text}` : text);

const escape = (value) => {
  const text = neutralizeFormula(value == null ? '' : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Course codes end up in the Content-Disposition header.
const safeFilenamePart = (value) => String(value || 'export').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);

const toCsv = (rows) => rows.map((row) => row.map(escape).join(',')).join('\r\n');

const isoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const statusLabel = (status) => {
  if (status === 'present') return 'Present';
  if (status === 'absent') return 'Absent';
  return 'Needs Review';
};

const loadSessionWithRecords = async (sessionId) => {
  const session = await AttendanceSession.findById(toObjectId(sessionId, 'session id')).lean();
  if (!session) throw new AppError('Attendance session not found', 404, { code: 'SESSION_NOT_FOUND' });
  const course = await courseService.getById(session.courseId);
  const records = await AttendanceRecord.find({ sessionId: session._id })
    .populate('studentId', 'studentId rollNumber name')
    .lean();
  records.sort((a, b) =>
    String(a.studentId?.rollNumber).localeCompare(String(b.studentId?.rollNumber), undefined, { numeric: true })
  );
  return { session, course, records };
};

const courseLabel = (course) => `${course.courseCode} - ${course.courseName}`;

// One row per student for a single session.
const exportSessionCsv = async (sessionId, user) => {
  const owned = await sessionService.getOwnedSession(sessionId, user);
  const { session, course, records } = await loadSessionWithRecords(owned._id);
  const rows = [COLUMNS];
  for (const record of records) {
    rows.push([
      record.studentId?.rollNumber ?? '',
      record.studentId?.name ?? '',
      statusLabel(record.status),
      courseLabel(course),
      isoDate(session.date)
    ]);
  }
  return {
    filename: `${safeFilenamePart(course.courseCode)}-${isoDate(session.date)}.csv`,
    csv: toCsv(rows)
  };
};

// One column per session date, one row per student — the whole course history.
const exportAllCsv = async (user) => {
  const sessions = await AttendanceSession.find({
    professorId: user._id,
    status: { $ne: SESSION_STATUS.FAILED }
  })
    .sort({ date: 1 })
    .lean();

  if (!sessions.length) {
    throw new AppError('No attendance sessions to export yet', 404, { code: 'NOTHING_TO_EXPORT' });
  }

  // Group by course so each CSV has a coherent set of date columns.
  const byCourse = new Map();
  for (const session of sessions) {
    const key = String(session.courseId);
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key).push(session);
  }

  const parts = [];
  for (const [, courseSessions] of byCourse) {
    const course = await courseService.getById(courseSessions[0].courseId);
    const dates = courseSessions.map((session) => isoDate(session.date));
    const dateBySessionId = new Map(courseSessions.map((session) => [String(session._id), isoDate(session.date)]));

    const records = await AttendanceRecord.find({
      sessionId: { $in: courseSessions.map((session) => session._id) }
    })
      .populate('studentId', 'studentId rollNumber name')
      .lean();

    // rollNumber -> { name, statusByDate }
    const students = new Map();
    for (const record of records) {
      const roll = record.studentId?.rollNumber;
      if (!roll) continue;
      const date = dateBySessionId.get(String(record.sessionId));
      if (!date) continue;
      if (!students.has(roll)) students.set(roll, { name: record.studentId?.name ?? '', byDate: new Map() });
      students.get(roll).byDate.set(date, statusLabel(record.status));
    }

    // Fill every enrolled student, including those with no record at all (all-absent).
    const enrolled = await Student.find({
      semester: course.semester,
      section: course.section,
      active: true
    })
      .sort({ rollNumber: 1 })
      .lean();
    for (const student of enrolled) {
      if (!students.has(student.rollNumber)) {
        students.set(student.rollNumber, { name: student.name, byDate: new Map() });
      }
    }

    const header = ['Roll Number', 'Name', ...dates];
    const rows = [header];
    for (const [roll, entry] of [...students.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    )) {
      rows.push([roll, entry.name, ...dates.map((date) => entry.byDate.get(date) || 'Absent')]);
    }
    parts.push(`# ${courseLabel(course)}\r\n${toCsv(rows)}`);
  }

  return {
    filename: 'attendance-all.csv',
    csv: parts.join('\r\n\r\n')
  };
};

module.exports = { exportSessionCsv, exportAllCsv, escape, toCsv };
