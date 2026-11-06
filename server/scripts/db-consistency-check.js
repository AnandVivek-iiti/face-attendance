#!/usr/bin/env node
/* READ-ONLY consistency report for the face-attendance database.
 * Usage (from server/):  node scripts/db-consistency-check.js [courseCode]
 * Uses only find / aggregate / countDocuments. Never writes. Prints counts and ids, never embeddings. */
const path = require('path');
require('dotenv').config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });
const mongoose = require('mongoose');

const COSINE_DUP = 0.9;       // two different students whose references this similar may be one person enrolled twice
const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
const findings = [];
const flag = (sev, id, msg, data) => { findings.push({ sev, id, msg, data }); console.log(`[${sev}] ${id}: ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`); };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'secondaryPreferred' });
  const db = mongoose.connection.db;
  const only = process.argv[2] && process.argv[2].toUpperCase();
  const courses = await db.collection('courses').find(only ? { courseCode: only } : {}).toArray();
  console.log(`Courses checked: ${courses.length}\n`);

  // C1 roster derivation is (semester, section) - flag courses that cannot derive one or that share one
  const keyOf = (c) => `${c.semester}|${c.section ?? ''}`;
  const shared = {};
  for (const c of courses) (shared[keyOf(c)] ||= []).push(c.courseCode);
  for (const c of courses) if (!c.section) flag('CRITICAL', 'C1', `course ${c.courseCode} has no section: roster query matches nobody`);
  for (const [k, codes] of Object.entries(shared)) if (codes.length > 1) flag('INFO', 'C2', `courses ${codes.join(', ')} share one roster (${k})`);

  for (const c of courses) {
    console.log(`\n== ${c.courseCode} sem ${c.semester} sec ${c.section ?? '-'} ==`);
    const roster = await db.collection('students').find({ semester: c.semester, section: c.section, active: true }, { projection: { studentId: 1, rollNumber: 1, name: 1, autoEnrolled: 1, hasFaceEmbedding: 1, department: 1, faceEmbeddings: 1 } }).toArray();
    console.log(`Active roster size: ${roster.length}`);
    const inactive = await db.collection('students').countDocuments({ semester: c.semester, section: c.section, active: false });
    if (inactive) flag('MEDIUM', 'S1', `${inactive} inactive student(s) in this section are excluded from the roster`);
    const auto = roster.filter((s) => s.autoEnrolled).length;
    if (auto) flag('MEDIUM', 'S2', `${auto} roster students are auto-generated (ID-XXXX / "Student XXXX")`);
    const noEmb = roster.filter((s) => !(s.faceEmbeddings && s.faceEmbeddings.length)).length;
    if (noEmb) flag('HIGH', 'S3', `${noEmb} roster students have no face reference and can never be matched`);
    const depts = [...new Set(roster.map((s) => s.department))];
    if (depts.length > 1) flag('LOW', 'S4', 'roster mixes departments (roster is not filtered by department)', depts);
    const generic = roster.filter((s) => /^Student /.test(s.name)).length;
    if (generic) flag('LOW', 'S5', `${generic} students still have a placeholder name`);

    // S6 possible duplicate enrolments (same person registered twice)
    const dup = [];
    for (let i = 0; i < roster.length; i++) for (let j = i + 1; j < roster.length; j++) {
      const A = roster[i].faceEmbeddings || [], B = roster[j].faceEmbeddings || [];
      let best = -1; for (const a of A) for (const b of B) best = Math.max(best, cosine(a, b));
      if (best >= COSINE_DUP) dup.push([roster[i].rollNumber, roster[j].rollNumber, +best.toFixed(3)]);
    }
    if (dup.length) flag('HIGH', 'S6', `${dup.length} student pair(s) have near-identical references (possible duplicate enrolment)`, dup.slice(0, 20));

    const sessions = await db.collection('attendancesessions').find({ courseId: c._id }).toArray();
    console.log(`Sessions: ${sessions.length}`);
    for (const s of sessions) {
      const recs = await db.collection('attendancerecords').aggregate([{ $match: { sessionId: s._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray();
      const by = Object.fromEntries(recs.map((r) => [r._id, r.n]));
      const total = (by.present || 0) + (by.absent || 0) + (by.needs_review || 0);
      const tag = `session ${s._id} (${new Date(s.date).toISOString().slice(0, 10)}, ${s.status})`;
      if (total !== (s.totalStudents ?? 0)) flag('HIGH', 'R1', `${tag}: stored totalStudents ${s.totalStudents} != record count ${total}`);
      if ((s.presentCount ?? 0) !== (by.present || 0) || (s.absentCount ?? 0) !== (by.absent || 0)) flag('HIGH', 'R2', `${tag}: stored present/absent ${s.presentCount}/${s.absentCount} != records ${by.present || 0}/${by.absent || 0}`);
      if (total !== roster.length) flag('MEDIUM', 'R3', `${tag}: ${total} records but active roster is ${roster.length}`);
      const rosterIds = new Set(roster.map((r) => String(r._id)));
      const ghosts = await db.collection('attendancerecords').countDocuments({ sessionId: s._id, studentId: { $nin: [...rosterIds].map((x) => new mongoose.Types.ObjectId(x)) } });
      if (ghosts) flag('MEDIUM', 'R4', `${tag}: ${ghosts} record(s) belong to students no longer on the roster`);
      const faces = (s.analysis && s.analysis.faces) || [];
      const unmatched = faces.filter((f) => !f.studentId).length;
      const clusters = new Set(faces.filter((f) => !f.studentId).map((f) => f.clusterId || `${f.imageId}:${f.faceId}`)).size;
      const matched = new Set(faces.filter((f) => f.studentId).map((f) => f.studentId));
      if (faces.length) console.log(`  ${tag}: faces ${faces.length}, matched students ${matched.size}, unmatched faces ${unmatched} (~${clusters} distinct), records present/absent/review ${by.present || 0}/${by.absent || 0}/${by.needs_review || 0}`);
      if (matched.size > (by.present || 0) + (by.needs_review || 0)) flag('HIGH', 'R5', `${tag}: ${matched.size} students have a matched face but only ${(by.present || 0) + (by.needs_review || 0)} are present/review (likely reviewed rows kept on re-analysis, or manual overrides)`);
      const lowAi = await db.collection('attendancerecords').countDocuments({ sessionId: s._id, status: 'present', source: 'ai', confidence: { $lt: 0.55 } });
      if (lowAi) flag('HIGH', 'R6', `${tag}: ${lowAi} AI-marked Present record(s) with similarity below 0.55 and no professor review`);
      if (s.status === 'finalized' && unmatched) flag('MEDIUM', 'R7', `${tag}: finalized with ${unmatched} unmatched face(s)`);
      const imgs = s.uploadedImages || [];
      const unusable = imgs.filter((i) => i.quality && i.quality.status === 'unusable').length;
      if (unusable) flag('HIGH', 'R8', `${tag}: ${unusable}/${imgs.length} photo(s) were skipped as unusable (their faces were never matched)`);
    }
  }
  const dupIdx = (await db.collection('attendancerecords').indexes()).some((i) => i.unique && i.key.sessionId === 1 && i.key.studentId === 1);
  if (!dupIdx) flag('CRITICAL', 'I1', 'unique index (sessionId, studentId) is missing on attendancerecords');
  console.log(`\nDone. ${findings.length} finding(s). No data was modified.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
