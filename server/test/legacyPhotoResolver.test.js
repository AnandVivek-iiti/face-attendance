const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFileIndex, resolveLegacyPath, inspectImage } = require('../src/utils/legacyPhotoResolver');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'));
const put = (root, rel, data = JPEG) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const resolve = (roots, legacyPath, oid = 'abc123') => resolveLegacyPath({ legacyPath, studentObjectId: oid, roots, index: buildFileIndex(roots) });

test('finds the file at the configured relative path', () => {
  const root = tmp(); const f = put(root, 'registered-faces/abc123-u1.jpg');
  const r = resolve([root], 'registered-faces/abc123-u1.jpg');
  assert.equal(r.status, 'found'); assert.equal(r.file, f);
});

test('finds the same filename under a different directory', () => {
  const root = tmp(); put(root, 'old/uploads/abc123-u1.jpg');
  assert.equal(resolve([root], 'registered-faces/abc123-u1.jpg').via, 'same-name-elsewhere');
});

test('finds the file under another filename only through the unique student-id prefix', () => {
  const root = tmp(); put(root, 'x/abc123-OTHERUUID.jpg');
  assert.equal(resolve([root], 'registered-faces/abc123-u1.jpg').via, 'student-id-prefix');
});

test('two DIFFERENT candidates are ambiguous and never guessed; identical copies are fine', () => {
  const root = tmp(); put(root, 'a/abc123-1.jpg', JPEG); put(root, 'b/abc123-2.jpg', Buffer.concat([JPEG, Buffer.from('x')]));
  assert.equal(resolve([root], 'registered-faces/missing.jpg').status, 'ambiguous');
  const dup = tmp(); put(dup, 'registered-faces/p.jpg'); put(dup, 'copy/p.jpg');
  assert.equal(resolve([dup], 'registered-faces/p.jpg').status, 'found');
});

test('missing source is reported as missing with the paths that were tried', () => {
  const r = resolve([tmp()], 'registered-faces/nope.jpg');
  assert.equal(r.status, 'missing'); assert.ok(r.tried.length > 0);
});

test('a path that escapes the root is not followed', () => {
  const root = tmp(); const outside = tmp(); put(outside, 'secret.jpg');
  assert.equal(resolve([root], `../${path.basename(outside)}/secret.jpg`).status, 'missing');
});

test('integrity: empty, non-image and valid files are told apart', () => {
  const root = tmp();
  assert.equal(inspectImage(put(root, 'e.jpg', Buffer.alloc(0))).reason, 'empty_file');
  assert.equal(inspectImage(put(root, 't.jpg', Buffer.from('hello world'))).reason, 'not_a_jpeg_png_or_webp');
  const ok = inspectImage(put(root, 'ok.jpg'));
  assert.equal(ok.ok, true); assert.equal(ok.mimeType, 'image/jpeg'); assert.equal(ok.sha256.length, 64);
});
