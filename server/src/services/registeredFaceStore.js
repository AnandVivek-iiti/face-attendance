// GridFS storage for student face images.
//   bucket "registeredFaces" : the ORIGINAL registered photograph of each student (registeredFaces.files / .chunks)
//   bucket "faceThumbnails"  : small crops taken from classroom photos for students who have no registered photo
// Attendance-session photos, enrollment-request photos and temp uploads stay on the filesystem and never enter these buckets.
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const AppError = require('../utils/AppError');
const { detectImageType } = require('../utils/fileSignature');

const { GridFSBucket, ObjectId } = mongoose.mongo;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const NOT_FOUND_CODES = new Set(['ENOENT', 26, 'FileNotFound']);

const asObjectId = (value) => {
  if (value instanceof ObjectId) return value;
  if (!ObjectId.isValid(String(value)) || String(value).length !== 24) {
    throw new AppError('Invalid image reference', 400, { code: 'INVALID_IMAGE_ID' });
  }
  return new ObjectId(String(value));
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const collect = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });

/**
 * @param bucketName  GridFS bucket name
 * @param kind        metadata.kind written to every file and required when reading it back (a file from another bucket/kind is "not found")
 * @param bucketFactory optional (db) => bucket, injected by tests
 */
const createStore = ({ bucketName, kind, bucketFactory }) => {
  let bucket;
  let bucketDb;

  const getBucket = () => {
    const db = mongoose.connection.db;
    if (!db || mongoose.connection.readyState !== 1) {
      throw new AppError('MongoDB is not connected; face image storage is unavailable', 503, { code: 'GRIDFS_UNAVAILABLE' });
    }
    if (!bucket || bucketDb !== db) {
      bucket = bucketFactory ? bucketFactory(db) : new GridFSBucket(db, { bucketName });
      bucketDb = db;
    }
    return bucket;
  };

  const findFile = async (fileId) => {
    const [file] = await getBucket().find({ _id: asObjectId(fileId) }).toArray();
    if (!file || !file.metadata || file.metadata.kind !== kind) return null;
    return file;
  };

  const notFound = () => new AppError('Face image was not found in MongoDB', 404, { code: 'REGISTERED_IMAGE_NOT_FOUND' });

  // The content type comes from the bytes, never from the client-supplied header.
  const store = async ({ buffer, filename, studentId, source = 'registered', extraMetadata = {} }) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError('Image data is empty', 400, { code: 'INVALID_IMAGE' });
    const mimeType = detectImageType(buffer);
    if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
      throw new AppError('Only JPEG, PNG or WebP images are allowed', 400, { code: 'INVALID_FILE_TYPE' });
    }
    const digest = sha256(buffer);
    const safeName = `${String(filename || 'face').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'face'}`;
    const upload = getBucket().openUploadStream(safeName, {
      contentType: mimeType,
      metadata: { kind, studentId: String(studentId), mimeType, source, sha256: digest, size: buffer.length, uploadedAt: new Date(), ...extraMetadata }
    });
    try {
      await new Promise((resolve, reject) => {
        upload.once('error', reject);
        upload.once('finish', resolve);
        Readable.from([buffer]).once('error', reject).pipe(upload);
      });
    } catch (error) {
      // Interrupted upload: drop the partial chunks so no unreadable file is left behind.
      if (typeof upload.abort === 'function') await upload.abort().catch(() => {});
      throw error;
    }
    // Verify what was written before anyone is allowed to reference it.
    const written = await findFile(upload.id);
    if (!written || written.length !== buffer.length) {
      await remove(upload.id).catch(() => {});
      throw new AppError('Stored image failed verification', 500, { code: 'GRIDFS_VERIFY_FAILED' });
    }
    return { fileId: upload.id, filename: safeName, mimeType, size: buffer.length, sha256: digest, extension: EXTENSIONS[mimeType] };
  };

  const getFile = async (fileId) => {
    const file = await findFile(fileId);
    if (!file) throw notFound();
    const buffer = await collect(getBucket().openDownloadStream(file._id));
    if (buffer.length !== file.length) throw new AppError('Stored image is corrupt', 500, { code: 'GRIDFS_CORRUPT' });
    return { buffer, filename: file.filename, mimeType: file.metadata.mimeType || file.contentType, metadata: file.metadata };
  };

  // For HTTP responses: nothing is buffered in memory.
  const openDownload = async (fileId) => {
    const file = await findFile(fileId);
    if (!file) throw notFound();
    const mimeType = file.metadata.mimeType || file.contentType;
    if (!ALLOWED_TYPES.has(mimeType)) throw notFound();
    return { stream: getBucket().openDownloadStream(file._id), mimeType, length: file.length, filename: file.filename, metadata: file.metadata };
  };

  // An earlier verified upload of identical bytes for this student (lets an interrupted migration resume without duplicates).
  const findBySha = async (studentId, digest) => {
    const [file] = await getBucket().find({ 'metadata.kind': kind, 'metadata.studentId': String(studentId), 'metadata.sha256': digest }).limit(1).toArray();
    return file ? file._id : null;
  };

  const exists = async (fileId) => {
    try {
      return Boolean(await findFile(fileId));
    } catch (error) {
      if (error.code === 'INVALID_IMAGE_ID') return false;
      throw error;
    }
  };

  const remove = async (fileId) => {
    if (!fileId) return;
    try {
      await getBucket().delete(asObjectId(fileId));
    } catch (error) {
      if (!NOT_FOUND_CODES.has(error.code) && !/FileNotFound/i.test(String(error.message))) throw error;
    }
  };

  return { store, getFile, openDownload, exists, findBySha, remove, asObjectId, BUCKET_NAME: bucketName, kind };
};

const registered = createStore({ bucketName: 'registeredFaces', kind: 'registered-student-face' });
const thumbnails = createStore({ bucketName: 'faceThumbnails', kind: 'student-face-thumbnail' });

module.exports = { ...registered, thumbnails, createStore, sha256 };
