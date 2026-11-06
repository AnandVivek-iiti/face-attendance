const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = mongoose.mongo;
const { Readable } = require('stream');
const AppError = require('../utils/AppError');

const BUCKET_NAME = 'registeredFaces';
let bucket;
let bucketDb;

const getBucket = () => {
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) {
    throw new AppError('MongoDB is not connected; registered face storage is unavailable', 503, {
      code: 'GRIDFS_UNAVAILABLE'
    });
  }
  if (!bucket || bucketDb !== db) {
    bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
    bucketDb = db;
  }
  return bucket;
};

const asObjectId = (value) => {
  if (value instanceof ObjectId) return value;
  if (!ObjectId.isValid(String(value))) {
    throw new AppError('Invalid registered image reference', 400, { code: 'INVALID_IMAGE_ID' });
  }
  return new ObjectId(String(value));
};

const store = async ({ buffer, filename, mimeType, studentId, source = 'registered' }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Image data is empty', 400, { code: 'INVALID_IMAGE' });
  }
  const upload = getBucket().openUploadStream(filename, {
    contentType: mimeType,
    metadata: { kind: 'registered-student-face', studentId: String(studentId), mimeType, source, uploadedAt: new Date() }
  });
  await new Promise((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    Readable.from([buffer]).pipe(upload);
  });
  return { fileId: upload.id, filename, mimeType, size: buffer.length };
};

const getFile = async (fileId) => {
  const id = asObjectId(fileId);
  const files = await getBucket().find({ _id: id }).toArray();
  const file = files[0];
  if (!file || file.metadata?.kind !== 'registered-student-face') {
    throw new AppError('Registered student image was not found in MongoDB', 404, { code: 'REGISTERED_IMAGE_NOT_FOUND' });
  }
  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = getBucket().openDownloadStream(id);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return {
    buffer: Buffer.concat(chunks),
    filename: file.filename,
    mimeType: file.metadata?.mimeType || file.contentType || 'application/octet-stream',
    metadata: file.metadata || {}
  };
};

const remove = async (fileId) => {
  if (!fileId) return;
  const id = asObjectId(fileId);
  try {
    await getBucket().delete(id);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 26) throw error;
  }
};

module.exports = { store, getFile, remove, asObjectId, BUCKET_NAME };
