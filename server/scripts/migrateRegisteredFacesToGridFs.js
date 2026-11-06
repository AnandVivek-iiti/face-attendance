/*
 * Safe, repeatable migration of legacy registered-faces files into MongoDB GridFS.
 * Does not delete or overwrite legacy files/paths. Run from server/ with its .env configured:
 *   node scripts/migrateRegisteredFacesToGridFs.js
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Student = require('../src/models/Student');
const storageService = require('../src/services/storageService');

const mimeFromName = (filename) => {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

const main = async () => {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  const students = await Student.find({ registeredImage: { $type: 'string', $ne: '' }, $or: [
    { registeredImageFileId: null }, { registeredImageFileId: { $exists: false } }
  ] }).select('+faceEmbeddings');
  let migrated = 0;
  let failed = 0;
  console.log(`Found ${students.length} legacy student photo references.`);

  for (const student of students) {
    try {
      const buffer = await storageService.readFile(student.registeredImage);
      const filename = student.registeredImage.split(/[\\/]/).pop();
      const mimeType = mimeFromName(filename);
      const stored = await storageService.storeRegisteredFace({
        buffer,
        filename,
        mimeType,
        studentId: student._id,
        source: 'legacy-migration'
      });
      const imageEntry = {
        fileId: stored.fileId,
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
        source: 'legacy-migration',
        uploadedAt: new Date()
      };
      const update = await Student.updateOne(
        { _id: student._id, $or: [{ registeredImageFileId: null }, { registeredImageFileId: { $exists: false } }] },
        { $set: { registeredImageFileId: stored.fileId }, $push: { registeredFaceImages: imageEntry } }
      );
      if (!update.modifiedCount) {
        await storageService.removeRegisteredFace(stored.fileId);
        console.log(`SKIPPED ${student.studentId}: record changed during migration`);
        continue;
      }
      migrated += 1;
      console.log(`MIGRATED ${student.studentId}`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED ${student.studentId}: ${error.message}`);
    }
  }

  console.log(`Migration complete. migrated=${migrated}, failed=${failed}. Legacy files and paths were retained.`);
  await mongoose.disconnect();
  if (failed > 0) process.exitCode = 2;
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
