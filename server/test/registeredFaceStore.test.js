// GridFS store logic against an in-memory bucket (no MongoDB available in this environment).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable, Readable } = require('node:stream');
const mongoose = require('mongoose');
const { createStore } = require('../src/services/registeredFaceStore');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 2)]);

const makeBucket = ({ truncate = false, failWrite = false } = {}) => {
  const files = new Map();
  const bucket = {
    files, aborted: 0,
    openUploadStream(filename, opts) {
      const id = new mongoose.mongo.ObjectId();
      const chunks = [];
      const w = new Writable({
        write(chunk, _e, cb) { if (failWrite) return cb(new Error('connection lost')); chunks.push(chunk); cb(); },
        final(cb) {
          const data = Buffer.concat(chunks);
          files.set(String(id), { _id: id, filename, length: truncate ? data.length - 1 : data.length, contentType: opts.contentType, metadata: opts.metadata, data });
          cb();
        }
      });
      w.id = id;
      w.abort = async () => { bucket.aborted += 1; files.delete(String(id)); };
      return w;
    },
    find(q) {
      const hit = [...files.values()].filter((f) => (!q._id || String(f._id) === String(q._id)) &&
        Object.entries(q).every(([k, v]) => !k.startsWith('metadata.') || f.metadata[k.slice(9)] === v));
      const cursor = { limit: () => cursor, toArray: async () => hit };
      return cursor;
    },
    openDownloadStream: (id) => Readable.from([files.get(String(id)).data]),
    async delete(id) { if (!files.delete(String(id))) { const e = new Error('FileNotFound'); e.code = 'FileNotFound'; throw e; } }
  };
  return bucket;
};

const withConnection = (fn) => async () => {
  const realDb = Object.getOwnPropertyDescriptor(mongoose.connection.constructor.prototype, 'db');
  Object.defineProperty(mongoose.connection, 'db', { value: {}, configurable: true });
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  try { await fn(); } finally {
    delete mongoose.connection.db; delete mongoose.connection.readyState; void realDb;
  }
};

const make = (opts) => { const bucket = makeBucket(opts); return { bucket, store: createStore({ bucketName: 'registeredFaces', kind: 'registered-student-face', bucketFactory: () => bucket }) }; };

test('stores, verifies and reads back an image; content type comes from the bytes', withConnection(async () => {
  const { store } = make();
  const saved = await store.store({ buffer: JPEG, filename: 'my face.jpg', studentId: 'S1', source: 'admin-upload' });
  assert.equal(saved.mimeType, 'image/jpeg');
  assert.equal(saved.size, JPEG.length);
  const back = await store.getFile(saved.fileId);
  assert.deepEqual(back.buffer, JPEG);
  assert.equal(back.metadata.studentId, 'S1');
  assert.equal(back.metadata.sha256, saved.sha256);
}));

test('rejects non-images and empty data without writing anything', withConnection(async () => {
  const { store, bucket } = make();
  await assert.rejects(store.store({ buffer: Buffer.from('<html>'), filename: 'x.jpg', studentId: 'S1' }), { code: 'INVALID_FILE_TYPE' });
  await assert.rejects(store.store({ buffer: Buffer.alloc(0), filename: 'x.jpg', studentId: 'S1' }), { code: 'INVALID_IMAGE' });
  assert.equal(bucket.files.size, 0);
}));

test('an interrupted upload is aborted and leaves no file behind', withConnection(async () => {
  const { store, bucket } = make({ failWrite: true });
  await assert.rejects(store.store({ buffer: JPEG, filename: 'x.jpg', studentId: 'S1' }), /connection lost/);
  assert.equal(bucket.aborted, 1);
  assert.equal(bucket.files.size, 0);
}));

test('a stored file that fails the length check is deleted and reported', withConnection(async () => {
  const { store, bucket } = make({ truncate: true });
  await assert.rejects(store.store({ buffer: JPEG, filename: 'x.jpg', studentId: 'S1' }), { code: 'GRIDFS_VERIFY_FAILED' });
  assert.equal(bucket.files.size, 0);
}));

test('missing file, invalid id and a file of another kind all read as not found', withConnection(async () => {
  const { store, bucket } = make();
  await assert.rejects(store.getFile(new mongoose.mongo.ObjectId()), { code: 'REGISTERED_IMAGE_NOT_FOUND' });
  await assert.rejects(store.getFile('not-an-id'), { code: 'INVALID_IMAGE_ID' });
  assert.equal(await store.exists('not-an-id'), false);
  const thumbs = createStore({ bucketName: 'faceThumbnails', kind: 'student-face-thumbnail', bucketFactory: () => bucket });
  const t = await thumbs.store({ buffer: PNG, filename: 't.png', studentId: 'S1' });
  await assert.rejects(store.getFile(t.fileId), { code: 'REGISTERED_IMAGE_NOT_FOUND' });
}));

test('remove is idempotent and findBySha finds an earlier upload of the same bytes', withConnection(async () => {
  const { store } = make();
  const a = await store.store({ buffer: JPEG, filename: 'a.jpg', studentId: 'S1' });
  assert.equal(String(await store.findBySha('S1', a.sha256)), String(a.fileId));
  assert.equal(await store.findBySha('S2', a.sha256), null);
  await store.remove(a.fileId);
  await store.remove(a.fileId);
  assert.equal(await store.exists(a.fileId), false);
}));

test('reports a clear 503 when MongoDB is not connected', async () => {
  const { store } = make();
  await assert.rejects(store.store({ buffer: JPEG, filename: 'a.jpg', studentId: 'S1' }), { code: 'GRIDFS_UNAVAILABLE' });
});
