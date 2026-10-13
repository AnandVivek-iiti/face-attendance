/* Exercises the professor's roster-building path directly:
 *   analysis has an unknown face -> assign it to a new roll number ->
 *   student is created, embedding stored, marked present -> counts update.
 * This is the logic that matters; it does not need a real photo. */
const db = require('../src/config/db');
const mongoose = require('mongoose');
const AttendanceSession = require('../src/models/AttendanceSession');
const AttendanceRecord = require('../src/models/AttendanceRecord');
const Student = require('../src/models/Student');
const Course = require('../src/models/Course');
const User = require('../src/models/User');
const faceAssignmentService = require('../src/services/faceAssignmentService');

const EMBEDDING = Array.from({ length: 512 }, (_, i) => Math.sin(i) * 0.5);

const steps = [];
const ok = (name, detail) => steps.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => steps.push(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);

const main = async () => {
  await db.connect();

  const course = await Course.findOne({ courseCode: 'ME217' });
  if (!course) throw new Error('ME217 course missing — run npm run seed:professor');
  const user = await User.findOne({ email: 'professor@example.com' });
  const actor = user;

  // Idempotent: clear leftovers from a previous run so "created" is meaningful.
  await Student.deleteOne({ rollNumber: 'ME217001' });
  await AttendanceSession.deleteMany({ professorId: actor._id, 'uploadedImages.filename': 'test.jpg' });

  // Fresh session for this test.
  const stamp = new Date();
  const imageId = new mongoose.Types.ObjectId();
  const session = await AttendanceSession.create({
    courseId: course._id,
    professorId: actor._id,
    date: stamp,
    status: 'review',
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    needsReviewCount: 0,
    uploadedImages: [
      {
        _id: imageId,
        filename: 'test.jpg',
        path: 'attendance-images/test/test.jpg',
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        quality: { status: 'good', blurScore: 200, brightnessScore: 0.8, message: null }
      }
    ],
    analysis: {
      analyzedAt: stamp,
      embeddingModel: 'buffalo_l',
      imageResults: [],
      faces: [
        {
          faceId: 'img1_face_001',
          imageId,
          bbox: [10, 10, 100, 100],
          detectionConfidence: 0.98,
          faceQuality: 0.9,
          studentId: null,
          similarity: null,
          decision: 'unknown',
          embedding: EMBEDDING
        }
      ],
      unknownFaces: [],
      unassignedFaces: [],
      studentsWithoutEmbedding: [],
      warnings: []
    }
  });
  ok('session ready', String(session._id));

  // --- Assign the face to a brand-new roll number ---
  let result;
  try {
    result = await faceAssignmentService.assignFace(String(session._id), 'img1_face_001', actor, {
      rollNumber: 'ME217001',
      name: 'Aditi Sharma'
    });
    ok('assign face to new student', `created=${result.created}`);
  } catch (error) {
    fail('assign face to new student', error.message);
    console.log(steps.join('\n'));
    await db.disconnect();
    process.exit(1);
  }

  const student = await Student.findOne({ rollNumber: 'ME217001' }).select('+faceEmbeddings');
  if (!student) fail('student persisted');
  else {
    ok('student persisted', `${student.rollNumber} ${student.name} sem=${student.semester} sec=${student.section}`);
    if (student.faceEmbeddings?.length === 1 && student.faceEmbeddings[0].length === 512) {
      ok('embedding stored', `vectors=${student.faceEmbeddings.length} dim=${student.faceEmbeddings[0].length}`);
    } else {
      fail('embedding stored', JSON.stringify({ n: student.faceEmbeddings?.length }));
    }
    if (student.embeddingModel === 'buffalo_l') ok('embeddingModel recorded', student.embeddingModel);
    else fail('embeddingModel recorded', String(student.embeddingModel));
    if (student.hasFaceEmbedding) ok('hasFaceEmbedding flag');
    else fail('hasFaceEmbedding flag');
  }

  const record = await AttendanceRecord.findOne({ sessionId: session._id, studentId: student._id });
  if (!record) fail('record created');
  else {
    ok('record created', `status=${record.status} source=${record.source}`);
    if (record.status === 'present') ok('marked present');
    else fail('marked present', record.status);
    if (record.evidence?.length === 1 && record.evidence[0].faceId === 'img1_face_001') {
      ok('evidence attached', record.evidence[0].faceId);
    } else fail('evidence attached', JSON.stringify(record.evidence?.length));
  }

  const refreshed = await AttendanceSession.findById(session._id);
  if (refreshed.presentCount === 1 && refreshed.totalStudents === 1) {
    ok('counts refreshed', `present=${refreshed.presentCount} total=${refreshed.totalStudents}`);
  } else {
    fail('counts refreshed', JSON.stringify({ p: refreshed.presentCount, t: refreshed.totalStudents }));
  }

  if (refreshed.analysis.faces[0].studentId === 'ME217001') ok('face marked assigned on session');
  else fail('face marked assigned on session', String(refreshed.analysis.faces[0].studentId));

  // --- Assigning a second face to the SAME student appends a second vector ---
  refreshed.analysis.faces.push({
    faceId: 'img1_face_002',
    imageId: refreshed.uploadedImages[0]._id,
    bbox: [20, 20, 110, 110],
    detectionConfidence: 0.97,
    faceQuality: 0.88,
    studentId: null,
    similarity: null,
    decision: 'unknown',
    embedding: Array.from({ length: 512 }, (_, i) => Math.cos(i) * 0.4)
  });
  refreshed.markModified('analysis');
  await refreshed.save();

  try {
    await faceAssignmentService.assignFace(String(session._id), 'img1_face_002', actor, { rollNumber: 'ME217001' });
    const again = await Student.findOne({ rollNumber: 'ME217001' }).select('+faceEmbeddings');
    if (again.faceEmbeddings.length === 2) ok('second vector appended', `vectors=${again.faceEmbeddings.length}`);
    else fail('second vector appended', String(again.faceEmbeddings.length));
  } catch (error) {
    fail('second vector appended', error.message);
  }

  // --- Re-assigning to the same roll is idempotent on the student count ---
  const studentCount = await Student.countDocuments({ rollNumber: 'ME217001' });
  if (studentCount === 1) ok('no duplicate student', `count=${studentCount}`);
  else fail('no duplicate student', `count=${studentCount}`);

  // --- Reject an unknown face id ---
  try {
    await faceAssignmentService.assignFace(String(session._id), 'nope', actor, { rollNumber: 'X', name: 'X' });
    fail('unknown face rejected');
  } catch (error) {
    if (error.statusCode === 404 || error.code === 'FACE_NOT_FOUND') ok('unknown face rejected', error.message);
    else fail('unknown face rejected', error.message);
  }

  // --- Reject a new roll number with no name ---
  try {
    await faceAssignmentService.assignFace(String(session._id), 'img1_face_001', actor, { rollNumber: 'ME217999' });
    fail('missing name rejected');
  } catch (error) {
    if (error.code === 'NAME_REQUIRED') ok('missing name rejected', error.message);
    else fail('missing name rejected', error.message);
  }

  // Cleanup.
  await AttendanceRecord.deleteMany({ sessionId: session._id });
  await AttendanceSession.deleteOne({ _id: session._id });
  await Student.deleteOne({ rollNumber: 'ME217001' });

  console.log('\n' + steps.join('\n'));
  const failed = steps.filter((line) => line.startsWith('FAIL')).length;
  await db.disconnect();
  process.exit(failed ? 1 : 0);
};

main().catch(async (error) => {
  console.error('ERROR', error);
  await db.disconnect();
  process.exit(1);
});
