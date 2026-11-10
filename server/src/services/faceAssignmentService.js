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
const courseEnrollmentService = require('./courseEnrollmentService');
const { SESSION_STATUS, RECORD_STATUS, RECORD_SOURCE, AUDIT_ACTIONS } = require('../config/constants');

const findFace = (session, faceId) => {
  const faces = (session.analysis && session.analysis.faces) || [];
  return faces.find((face) => face.faceId === faceId) || null;
};

// Resolve the student a roll number belongs to inside this course.
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
      await courseEnrollmentService.enroll(course._id, student._id, 'face_assignment');
      return { student, created: true };
    } catch (error) {
      if (!(error && error.code === 11000)) throw error; // vanishingly rare id clash: retry
    }
  }
  throw new AppError('Could not generate a unique student ID', 500, { code: 'ID_GENERATION_FAILED' });
};

const resolveStudent = async (course, rollNumber, name, department) => {
  if (!rollNumber) return createGeneratedStudent(course, name, department);
  // Roll numbers are unique across the institute, so look the student up by roll number alone and enroll them in this course.
  const find = () => Student.findOne({ rollNumber });
  const existing = await find();
  if (existing) {
    if (!existing.active) {
      existing.active = true;
      await existing.save();
    }
    await courseEnrollmentService.enroll(course._id, existing._id, 'face_assignment');
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
    await courseEnrollmentService.enroll(course._id, student._id, 'face_assignment');
    return { student, created: true };
  } catch (error) {
    // Two requests enrolling the same roll number at once: the loser re-reads.
    if (error && error.code === 11000) {
      const winner = await find();
      if (winner) {
        await courseEnrollmentService.enroll(course._id, winner._id, 'face_assignment');
        return { student: winner, created: false };
      }
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

// Everything one assignment does EXCEPT writing the face marker back onto the session (callers do that atomically) and the audit entry /...
const applyAssignment = async (session, course, face, input) => {
  if (!face.embedding || !face.embedding.length) {
    throw new AppError('This face has no embedding to store', 422, { code: 'FACE_NO_EMBEDDING' });
  }
  let resolved = null;
  if (!input.rollNumber && face.studentId) {
    // The face is already linked to a roster student: confirming it must not mint a second, auto-generated student.
    const prior = await Student.findOne({ studentId: face.studentId, active: true });
    if (prior && (await courseEnrollmentService.isEnrolled(course._id, prior._id))) {
      resolved = { student: prior, created: false };
    }
  }
  const { student, created } = resolved || (await resolveStudent(course, input.rollNumber, input.name, input.department));

  // The professor's assignment is authoritative for ATTENDANCE. Whether the classroom face also becomes a reference vector is a
  // separate, stricter decision (see decideAssignmentEmbedding), so one misclick cannot poison a student's gallery.
  await studentService.appendAssignmentEmbedding(
    student,
    face,
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

  // Atomic positional update of just this face.
  await AttendanceSession.updateOne(
    { _id: session._id, 'analysis.faces.faceId': face.faceId },
    { $set: faceMarker('analysis.faces.$', student, face) }
  );

  // Give the student a visible face thumbnail cropped from the classroom photo.
  await studentService.storeFaceThumbnails(session, [{ student, face }]);

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

// Enroll many faces in one request ("enroll the whole page").
const assignFaces = async (sessionId, user, { assignments }) => {
  const session = await sessionService.getOwnedSession(sessionId, user);
  assertAssignable(session);
  const course = await courseService.getById(session.courseId);

  const results = [];
  const markers = [];
  const audits = [];
  const thumbnails = [];
  // Sequential on purpose: two rows with the same new roll number must see each other's student instead of racing to create it.
  for (const input of assignments) {
    const face = findFace(session, input.faceId);
    if (!face) {
      results.push({ faceId: input.faceId, ok: false, code: 'FACE_NOT_FOUND', message: 'Face not found in this session' });
      continue;
    }
    try {
      const { student, created } = await applyAssignment(session, course, face, input);
      markers.push({ face, student });
      thumbnails.push({ student, face });
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
    await studentService.storeFaceThumbnails(session, thumbnails);
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
