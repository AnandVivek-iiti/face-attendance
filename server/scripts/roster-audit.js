#!/usr/bin/env node
/* READ-ONLY roster audit for one semester/section. Writes nothing.
 * From the server folder:  node scripts\roster-audit.js [--semester 3] [--section A] [--pair 0.5]
 * Prints: roster makeup, students never marked present, candidate duplicate enrolments, and why review-state sessions matched nobody.
 * Candidate pairs are suggestions for a human to check, not decisions. Embeddings are never printed. */
const path = require('path');

const cosine = (a, b) => {
  if (!a || !b || a.length !== b.length) return -1;
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i += 1) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / (Math.sqrt(x * y) || 1);
};

// Best reference-to-reference cosine for every pair of different students; returns pairs at or above `threshold`.
const findPairs = (students, threshold) => {
  const out = [];
  for (let i = 0; i < students.length; i += 1) {
    for (let j = i + 1; j < students.length; j += 1) {
      let best = -1;
      for (const a of students[i].faceEmbeddings || []) for (const b of students[j].faceEmbeddings || []) best = Math.max(best, cosine(a, b));
      if (best >= threshold) out.push({ a: students[i], b: students[j], score: best });
    }
  }
  return out.sort((p, q) => q.score - p.score);
};

const label = (s) => `${s.rollNumber} "${s.name}"${s.autoEnrolled ? ' [auto]' : ''}`;
module.exports = { cosine, findPairs };

if (require.main === module) {
  require('dotenv').config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });
  const mongoose = require('mongoose');
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI, { readPreference: 'secondaryPreferred' });
    const db = mongoose.connection.db;
    const semester = Number(arg('semester', 3));
    const section = arg('section', 'A');
    const threshold = Number(arg('pair', 0.5));
    const students = await db.collection('students').find({ semester, section, active: true }).toArray();
    const auto = students.filter((s) => s.autoEnrolled);
    console.log(`Cohort: semester ${semester}, section ${section}`);
    console.log(`Active students: ${students.length} (named ${students.length - auto.length}, auto-generated ${auto.length})`);
    console.log(`Without any face reference: ${students.filter((s) => !(s.faceEmbeddings && s.faceEmbeddings.length)).length}`);
    const models = {};
    students.forEach((s) => { models[s.embeddingModel || 'none'] = (models[s.embeddingModel || 'none'] || 0) + 1; });
    console.log('Embedding models in use:', JSON.stringify(models));

    const courses = await db.collection('courses').find({ semester, section }).project({ _id: 1 }).toArray();
    const sessions = await db.collection('attendancesessions').find({ courseId: { $in: courses.map((c) => c._id) } }).sort({ date: 1 }).toArray();
    const finalized = sessions.filter((s) => s.status === 'finalized');
    const present = await db.collection('attendancerecords').aggregate([
      { $match: { sessionId: { $in: finalized.map((s) => s._id) }, status: 'present' } },
      { $group: { _id: '$studentId', n: { $sum: 1 } } }
    ]).toArray();
    const presentBy = new Map(present.map((p) => [String(p._id), p.n]));
    const never = students.filter((s) => !presentBy.get(String(s._id)));
    console.log(`\nFinalized sessions in this cohort: ${finalized.length}`);
    console.log(`Students never marked present in any finalized session: ${never.length}`);
    never.forEach((s) => console.log('  ' + label(s)));

    const pairs = findPairs(students, threshold);
    console.log(`\nCandidate duplicate enrolments (reference similarity >= ${threshold}): ${pairs.length}`);
    pairs.forEach((p) => console.log(`  ${p.score.toFixed(3)}  ${label(p.a)}  <->  ${label(p.b)}`));

    console.log('\nSessions still in review:');
    for (const s of sessions.filter((x) => x.status !== 'finalized')) {
      const a = s.analysis || {};
      const faces = a.faces || [];
      const by = {};
      faces.forEach((f) => { by[f.decision] = (by[f.decision] || 0) + 1; });
      console.log(`  ${s._id} ${new Date(s.date).toISOString().slice(0, 10)} status=${s.status}`);
      console.log(`    embeddingModel=${a.embeddingModel || 'none'} faces=${faces.length} decisions=${JSON.stringify(by)} roster-without-embedding=${(a.studentsWithoutEmbedding || []).length}`);
      (a.warnings || []).forEach((w) => console.log(`    warning: ${w.type}${w.message ? ' - ' + w.message : ''}`));
    }
    console.log('\nDone. No data was modified.');
    await mongoose.disconnect();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
