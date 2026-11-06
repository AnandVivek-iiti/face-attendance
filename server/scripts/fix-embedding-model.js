#!/usr/bin/env node
/* Tags legacy face references with the ML model name. DRY RUN by default: prints what it would change and writes nothing.
 * From the server folder:
 *   node scripts\fix-embedding-model.js                       (dry run)
 *   node scripts\fix-embedding-model.js --apply               (writes; saves a JSON backup first)
 *   node scripts\fix-embedding-model.js --apply --deactivate 240003006    (also deactivates that student; reversible via the backup)
 * Only the `embeddingModel` field (and `active` when --deactivate is given) is written. Face vectors are never touched. */
const fs = require('fs');
const path = require('path');

const EXPECTED_DIM = 512;

// Pure planning step (unit-testable): which students are untagged, and is it safe to tag them?
const plan = (students, model) => {
  const untagged = students.filter((s) => !s.embeddingModel && Array.isArray(s.faceEmbeddings) && s.faceEmbeddings.length);
  const badDim = untagged.filter((s) => s.faceEmbeddings.some((v) => !Array.isArray(v) || v.length !== EXPECTED_DIM));
  return { untagged, badDim, safe: untagged.length > 0 && badDim.length === 0, model };
};
module.exports = { plan };

if (require.main === module) {
  require('dotenv').config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '../../.env')] });
  const mongoose = require('mongoose');
  const has = (n) => process.argv.includes('--' + n);
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const col = mongoose.connection.db.collection('students');
    const model = arg('model', 'buffalo_l');
    const all = await col.find({ active: true }, { projection: { rollNumber: 1, name: 1, embeddingModel: 1, faceEmbeddings: 1 } }).toArray();
    const p = plan(all, model);
    console.log(`Active students: ${all.length}. Untagged with face references: ${p.untagged.length}. Would tag as "${model}".`);
    if (p.badDim.length) {
      console.log(`STOP: ${p.badDim.length} student(s) have vectors that are not ${EXPECTED_DIM}-dimensional, so they may come from another model:`);
      p.badDim.forEach((s) => console.log('  ' + s.rollNumber));
      process.exit(1);
    }
    const deact = arg('deactivate', null);
    let target = null;
    if (deact) {
      target = await col.findOne({ rollNumber: deact }, { projection: { rollNumber: 1, name: 1, active: 1 } });
      console.log(target ? `Would deactivate: ${target.rollNumber} "${target.name}"` : `No student with roll number ${deact}; nothing to deactivate.`);
    }
    if (!has('apply')) { console.log('\nDry run only. Add --apply to write. Nothing was changed.'); await mongoose.disconnect(); return; }

    const dir = path.join(__dirname, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `embedding-model-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify({
      tagged: p.untagged.map((s) => ({ _id: String(s._id), rollNumber: s.rollNumber, previousEmbeddingModel: s.embeddingModel ?? null })),
      deactivated: target ? { _id: String(target._id), rollNumber: target.rollNumber, previousActive: target.active } : null
    }, null, 1));
    console.log('Backup written: ' + file);
    if (p.untagged.length) {
      const r = await col.bulkWrite(p.untagged.map((s) => ({ updateOne: { filter: { _id: s._id, embeddingModel: { $in: [null, ''] } }, update: { $set: { embeddingModel: model } } } })));
      console.log(`Tagged ${r.modifiedCount} student(s) as "${model}".`);
    }
    if (target) { await col.updateOne({ _id: target._id }, { $set: { active: false } }); console.log(`Deactivated ${target.rollNumber}.`); }
    await mongoose.disconnect();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
