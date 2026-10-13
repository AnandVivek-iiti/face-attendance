const crypto = require('crypto');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const auditService = require('./auditService');
const courseService = require('./courseService');
const recordService = require('./recordService');
const sessionService = require('./sessionService');
const studentService = require('./studentService');
const { SESSION_STATUS, RECORD_STATUS, RECORD_SOURCE, AUDIT_ACTIONS } = require('../config/constants');

const findFace = (session, faceId) => {
  const faces = (session.analysis && session.analysis.faces) || [];
  return faces.find((face) => face.faceId === faceId) || null;
};

// Resolve the student a roll number belongs to inside this course. A new roll
// number creates the student on the spot, which is how the roster is grown from
// the photos of a first session.
// Bulk enrollment does not ask for names. The database key is a UUID; the roll
// number and name are unique placeholders the professor replaces later.
const createGeneratedStudent = async (course, name, department) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const uuid = crypto.randomUUID();
    const short = uuid.slice(0, 8).toUpperCase();
    try {
      const student = await Student.create({
        studentId: uuid,
        rollNumber: `ID-${short}`,
        name: name || `Student ${short}`,
        department: department || course.department || 'Unassigned',
        semester: course.semester,
        section: course.section,
        autoEnrolled: true
      });
      return { student, created: true };
    } catch (error) {
      if (!(error && error.code === 11000)) throw error; // vanishingly rare id clash: retry
    }
  }
  throw new AppError('Could not generate a unique student ID', 500, { code: 'ID_GENERATION_FAILED' });
};

const resolveStudent = async (course, rollNumber, name, department) => {
  if (!rollNumber) return createGeneratedStudent(course, name, department);
  const find = () => Student.findOne({ rollNumber, semester: course.semester, section: course.section });
  const existing = await find();
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
    }
    return { student: existing, created: false };
  }
  try {
    const student = await Student.create({
      studentId: rollNumber,
      rollNumber,
      name: name || `Student ${rollNumber}`,
      department: department || course.department || 'Unassigned',
      semester: course.semester,
      section: course.section,
      autoEnrolled: !name
    });
    return { student, created: true };
  } catch (error) {
    // Two requests enrolling the same roll number at once: the loser re-reads.
    if (error && error.code === 11000) {
      const winner = await find();
      if (winner) return { student: winner, created: false };
    }
    throw error;
  }
};

const assertAssignable = (session) => {
  if (session.status === SESSION_STATUS.FINALIZED) {
    throw new AppError('Attendance session is already finalized', 409, { code: 'SESSION_FINALIZED' });
  }
  if (session.status !== SESSION_STATUS.REVIEW) {
    throw new AppError(`Faces cannot be assigned while the session is ${session.status}`, 409, {
      code: 'SESSION_NOT_IN_REVIEW'
    });
  }
};

const evidenceFor = (face) => [
  {
    imageId: face.imageId,
    faceId: face.faceId,
    bbox: face.bbox || [],
    similarity: face.similarity ?? null,
    faceQuality: face.faceQuality ?? null,
    detectionConfidence: face.detectionConfidence ?? null,
    decision: 'high_confidence'
  }
];

/**
 * Everything one assignment does EXCEPT writing the face marker back onto the
 * session (callers do that atomically) and the audit entry / session counts
 * (callers batch those).
 */
const applyAssignment = async (session, course, face, input) => {
  if (!face.embedding || !face.embedding.length) {
    throw new AppError('This face has no embedding to store', 422, { code: 'FACE_NO_EMBEDDING' });
  }
  const { student, created } = await resolveStudent(course, input.rollNumber, input.name, input.department);

  // Keep several classroom captures per student. The one we are assigning now
  // may be taken from an awkward angle, so it joins rather than replaces.
  await studentService.appendEmbedding(
    student,
    face.embedding,
    (session.analysis && session.analysis.embeddingModel) || null
  );

  // Upsert (not find-then-save) so concurrent assignments cannot collide.
  await AttendanceRecord.updateOne(
    { sessionId: session._id, studentId: student._id },
    {
      $set: {
        status: RECORD_STATUS.PRESENT,
        source: RECORD_SOURCE.MANUAL,
        decision: 'high_confidence',
        confidence: face.similarity ?? null,
        faceQuality: face.faceQuality ?? null,
        aiStudentId: face.studentId ?? null,
        evidence: evidenceFor(face),
        reviewedByProfessor: true,
        reviewedAt: new Date()
      }
    },
    { upsert: true }
  );
  return { student, created };
};

const faceMarker = (prefix, student, face) => ({
  [`${prefix}.studentId`]: student.studentId,
  [`${prefix}.decision`]: 'high_confidence',
  [`${prefix}.similarity`]: face.similarity ?? 1
});

const assignFace = async (sessionId, faceId, user, body) => {
  const session = await sessionService.getOwnedSession(sessionId, user);
  assertAssignable(session);

  const face = findFace(session, faceId);
  if (!face) throw new AppError('Face not found in this session', 404, { code: 'FACE_NOT_FOUND' });

  const course = await courseService.getById(session.courseId);
  const { student, created } = await applyAssignment(session, course, face, body);

  // Atomic positional update of just this face. The old code wrote the whole
  // (stale) analysis blob back, so enrolling several faces at once let each
  // request overwrite the others' markers and faces reappeared as "Pending".
  await AttendanceSession.updateOne(
    { _id: session._id, 'analysis.faces.faceId': face.faceId },
    { $set: faceMarker('analysis.faces.$', student, face) }
  );

  await auditService.record(
    auditService.userEntry(user, {
      sessionId: session._id,
      studentId: student._id,
      action: AUDIT_ACTIONS.IDENTITY_CHANGED,
      after: { status: RECORD_STATUS.PRESENT, faceId: face.faceId, created }
    })
  );

  const summary = await recordService.refreshSessionCounts(session._id);
  return {
    studentId: student.studentId,
    rollNumber: student.rollNumber,
    name: student.name,
    faceId: face.faceId,
    created,
    summary
  };
};

/**
 * Enroll many faces in one request ("enroll the whole page"). One session load,
 * one course load, one marker write, one count refresh; a bad row is reported
 * per face and does not stop the others.
 */
const assignFaces = async (sessionId, user, { assignments }) => {
  const session = await sessionService.getOwnedSession(sessionId, user);
  assertAssignable(session);
  const course = await courseService.getById(session.courseId);

  const results = [];
  const markers = [];
  const audits = [];
  // Sequential on purpose: two rows with the same new roll number must see each
  // other's student instead of racing to create it.
  for (const input of assignments) {
    const face = findFace(session, input.faceId);
    if (!face) {
      results.push({ faceId: input.faceId, ok: false, code: 'FACE_NOT_FOUND', message: 'Face not found in this session' });
      continue;
    }
    try {
      const { student, created } = await applyAssignment(session, course, face, input);
      markers.push({ face, student });
      audits.push(
        auditService.userEntry(user, {
          sessionId: session._id,
          studentId: student._id,
          action: AUDIT_ACTIONS.IDENTITY_CHANGED,
          after: { status: RECORD_STATUS.PRESENT, faceId: face.faceId, created }
        })
      );
      results.push({
        faceId: face.faceId,
        ok: true,
        studentId: student.studentId,
        rollNumber: student.rollNumber,
        name: student.name,
        created
      });
    } catch (error) {
      results.push({
        faceId: input.faceId,
        ok: false,
        code: error.code || 'ASSIGN_FAILED',
        message: error.message || 'Could not enroll this face'
      });
    }
  }

  if (markers.length) {
    const $set = {};
    const arrayFilters = [];
    markers.forEach(({ face, student }, index) => {
      const key = `f${index}`;
      Object.assign($set, faceMarker(`analysis.faces.$[${key}]`, student, face));
      arrayFilters.push({ [`${key}.faceId`]: face.faceId });
    });
    await AttendanceSession.updateOne({ _id: session._id }, { $set }, { arrayFilters });
    await auditService.recordMany(audits);
  }

  const summary = await recordService.refreshSessionCounts(session._id);
  return {
    enrolled: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    summary
  };
};

module.exports = { assignFace, assignFaces };
