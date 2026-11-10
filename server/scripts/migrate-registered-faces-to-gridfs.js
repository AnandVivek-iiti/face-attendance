#!/usr/bin/env node
// Copies legacy filesystem registered photos (Student.registeredImage = "registered-faces/<file>") into GridFS bucket "registeredFaces".
//
// DRY RUN BY DEFAULT: without --apply nothing in MongoDB or on disk is changed.
//   node scripts/migrate-registered-faces-to-gridfs.js --source-root D:\backup\storage
//   node scripts/migrate-registered-faces-to-gridfs.js --source-root D:\backup\storage --source-root C:\old\storage --report-dir reports
//   node scripts/migrate-registered-faces-to-gridfs.js --source-root D:\backup\storage --apply
//
// Safety rules:
//  - Never deletes or edits a source file, a student's embeddings, attendance history, or the legacy `registeredImage` value
//    (kept for rollback). The Student only gains registeredImageFileId + a registeredFaceImages entry, and only after the GridFS
//    copy has been read back and its SHA-256 matches the source.
//  - Idempotent and resumable: students that already have a valid GridFS file are skipped; an upload from an interrupted earlier run
//    (same student + same SHA-256) is reused instead of duplicated.
//  - Never guesses: a missing or ambiguous source is reported and skipped. No placeholders, no attendance photos, nothing generated.
//  - In production (NODE_ENV=production) --apply additionally requires --confirm-production.
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const env = require('../src/config/env');
const Student = require('../src/models/Student');
const registeredFaceStore = require('../src/services/registeredFaceStore');
const { buildFileIndex, resolveLegacyPath, inspectImage } = require('../src/utils/legacyPhotoResolver');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const options = (name) => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []));

const classify = async (student, roots, index) => {
  const base = { studentId: student.studentId, rollNumber: student.rollNumber, objectId: String(student._id), legacyPath: student.registeredImage };
  if (student.registeredImageFileId && (await registeredFaceStore.exists(student.registeredImageFileId))) {
    return { ...base, status: 'already_migrated' };
  }
  const found = resolveLegacyPath({ legacyPath: student.registeredImage, studentObjectId: String(student._id), roots, index });
  if (found.status === 'missing') return { ...base, status: 'missing', tried: found.tried };
  if (found.status === 'ambiguous') return { ...base, status: 'ambiguous', candidates: found.candidates };
  const inspected = inspectImage(found.file);
  if (!inspected.ok) return { ...base, status: 'invalid', file: found.file, reason: inspected.reason };
  return { ...base, status: 'available', file: found.file, via: found.via, size: inspected.size, sha256: inspected.sha256, inspected };
};

const apply = async (item, student) => {
  const { buffer, mimeType } = item.inspected;
  // Resume after an interruption: reuse an earlier verified upload of the same bytes for the same student.
  let fileId;
  const prior = await registeredFaceStore.findBySha(student.studentId, item.sha256);
  if (prior) fileId = prior;
  else {
    const stored = await registeredFaceStore.store({
      buffer, filename: path.basename(item.file), studentId: student.studentId, source: 'legacy-migration',
      extraMetadata: { legacyPath: item.legacyPath }
    });
    const readBack = await registeredFaceStore.getFile(stored.fileId);
    if (registeredFaceStore.sha256(readBack.buffer) !== item.sha256) {
      await registeredFaceStore.remove(stored.fileId);
      throw new Error('GridFS read-back did not match the source file');
    }
    fileId = stored.fileId;
  }
  const result = await Student.updateOne(
    { _id: student._id, registeredImageFileId: student.registeredImageFileId ?? null },
    {
      $set: { registeredImageFileId: fileId },
      $push: { registeredFaceImages: { fileId, filename: path.basename(item.file), mimeType, size: item.size, source: 'legacy-migration', uploadedAt: new Date() } }
    }
  );
  if (result.matchedCount === 0) throw new Error('Student changed during migration; re-run');
  return String(fileId);
};

const writeReports = (dir, summary, rows, applied) => {
  fs.mkdirSync(dir, { recursive: true });
  const clean = rows.map(({ inspected, ...rest }) => rest);
  fs.writeFileSync(path.join(dir, 'migration-report.json'), JSON.stringify({ summary, rows: clean }, null, 2));
  const list = (status) => clean.filter((r) => r.status === status);
  const md = [
    '# Migration report: registered photos to GridFS',
    '',
    `Mode: **${applied ? 'APPLY' : 'DRY RUN (nothing was changed)'}**  |  Generated: ${new Date().toISOString()}`,
    '',
    '| | count |', '|---|---|',
    ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Missing source files (student document, embeddings and history are untouched)',
    ...(list('missing').length ? list('missing').map((r) => `- ${r.studentId} (${r.rollNumber}) -> \`${r.legacyPath}\``) : ['_none_']),
    '',
    '## Ambiguous (several different candidates; needs a human decision)',
    ...(list('ambiguous').length ? list('ambiguous').map((r) => `- ${r.studentId}: ${r.candidates.join(', ')}`) : ['_none_']),
    '',
    '## Invalid source files',
    ...(list('invalid').length ? list('invalid').map((r) => `- ${r.studentId}: ${r.file} (${r.reason})`) : ['_none_']),
    '',
    '## Failed uploads',
    ...(list('failed').length ? list('failed').map((r) => `- ${r.studentId}: ${r.error}`) : ['_none_'])
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'MIGRATION-REPORT.md'), md);
};

const main = async () => {
  const doApply = flag('--apply');
  if (doApply && process.env.NODE_ENV === 'production' && !flag('--confirm-production')) {
    throw new Error('Refusing to --apply with NODE_ENV=production without --confirm-production. Review the dry-run report first.');
  }
  const roots = [...new Set([...options('--source-root'), env.storageRoot].map((r) => path.resolve(r)))];
  console.log(`${doApply ? 'APPLY' : 'DRY RUN'}; searching source roots:\n  ${roots.join('\n  ')}`);
  await db.connect();
  const index = buildFileIndex(roots);
  console.log(`indexed ${index.names.length} image file(s) under the source roots`);

  const students = await Student.find({ registeredImage: { $nin: [null, ''] } });
  const rows = [];
  for (const student of students) rows.push({ ...(await classify(student, roots, index)), _doc: student });

  let migrated = 0;
  for (const row of rows) {
    if (doApply && row.status === 'available') {
      try {
        row.fileId = await apply(row, row._doc);
        row.status = 'migrated';
        migrated += 1;
      } catch (error) {
        row.status = 'failed';
        row.error = error.message;
      }
    }
  }
  const out = rows.map(({ _doc, ...rest }) => rest);
  const count = (s) => out.filter((r) => r.status === s).length;
  const summary = {
    legacyReferences: out.length,
    availableSourceFiles: count('available') + count('migrated') + count('failed'),
    missingSourceFiles: count('missing'),
    ambiguous: count('ambiguous'),
    invalidSourceFiles: count('invalid'),
    alreadyMigrated: count('already_migrated'),
    migratedThisRun: migrated,
    failed: count('failed'),
    wouldMigrate: doApply ? 0 : count('available')
  };
  console.log(summary);
  const dir = path.resolve(options('--report-dir')[0] || 'migration-reports');
  writeReports(dir, summary, out, doApply);
  console.log(`report written to ${dir}`);
  if (!doApply) console.log('Dry run only. Nothing was uploaded or changed.');
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
