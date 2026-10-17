
const db = require('../src/config/db');
const Student = require('../src/models/Student');
const AttendanceSession = require('../src/models/AttendanceSession');
const studentService = require('../src/services/studentService');
const storageService = require('../src/services/storageService');

const dryRun = process.argv.includes('--dry-run');

// Students enrolled from a classroom photo have face vectors but no stored
// image. Walk the sessions where they were assigned and crop a thumbnail from
// the classroom photo they appear in. The ML service must be running with the
// /crop-face endpoint.
const main = async () => {
  await db.connect();
  storageService.ensureDirs();

  const students = await Student.find({ registeredImage: null, hasFaceEmbedding: true })
    .select('_id studentId')
    .lean();
  if (students.length === 0) {
    console.log('Every enrolled student already has a photo.');
    return;
  }

  const pending = new Map(students.map((student) => [student.studentId, student]));
  console.log(`${pending.size} student(s) missing a photo${dryRun ? ' (dry run)' : ''}.`);

  const sessions = await AttendanceSession.find({ 'analysis.faces.studentId': { $in: [...pending.keys()] } });

  let processed = 0;
  for (const session of sessions) {
    const entries = [];
    for (const face of (session.analysis && session.analysis.faces) || []) {
      const student = face.studentId ? pending.get(face.studentId) : null;
      if (!student || !Array.isArray(face.bbox) || face.bbox.length !== 4 || !face.imageId) continue;
      entries.push({ student, face });
      pending.delete(face.studentId); // one photo per student is enough
    }
    if (!entries.length) continue;
    if (dryRun) {
      console.log(`  session ${session._id}: would crop ${entries.length} face(s)`);
    } else {
      await studentService.storeFaceThumbnails(session, entries);
      console.log(`  session ${session._id}: cropped ${entries.length} face(s)`);
    }
    processed += entries.length;
  }

  console.log(`Done. ${dryRun ? 'Would process' : 'Processed'} ${processed}; ${pending.size} still without a photo.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
