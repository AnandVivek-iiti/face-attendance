require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const z = require('zod').z;
const User = require('../src/models/User');
const { app } = require('../src/app');
const exportService = require('../src/services/exportService');
const presenters = require('../src/utils/presenters');
const fileAccessService = require('../src/services/fileAccessService');
const validate = require('../src/middleware/validate');
const schemas = require('../src/utils/validation');

test('CSV cells that look like formulas are neutralised', () => {
  for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) {
    const cell = exportService.escape(evil);
    assert.ok(/^"?'/.test(cell), `${JSON.stringify(evil)} -> ${cell}`);
  }
  assert.equal(exportService.escape('ME23001'), 'ME23001');
  assert.equal(exportService.escape('Doe, Jane'), '"Doe, Jane"');
  assert.equal(exportService.escape('say "hi"'), '"say ""hi"""');
});

test('session payloads never include face embeddings', () => {
  const payload = presenters.session({
    _id: 's1',
    courseId: 'c1',
    uploadedImages: [],
    analysis: { faces: [{ faceId: 'img1_face_001', imageId: 'i1', embedding: [0.1, 0.2] }], warnings: [] }
  });
  assert.equal(JSON.stringify(payload).includes('embedding'), false);
  assert.equal(payload.analysis.faces[0].faceId, 'img1_face_001');
});

test('storage path allowlist rejects traversal and foreign names', () => {
  const id = 'a'.repeat(24);
  assert.ok(fileAccessService.classify(`attendance-images/${id}/3f2a-91bc.jpg`));
  assert.ok(fileAccessService.classify(`profile-images/${id}-3f2a-91bc.png`));
  for (const bad of [
    'attendance-images/../temporary/x.jpg',
    `attendance-images/${id}/../../x.jpg`,
    'attendance-images/%2e%2e/x.jpg',
    `attendance-images/${id}/x.upload`,
    `registered-faces/${id}-x.jpg%00.png`,
    '/etc/passwd',
    'temporary/x.jpg',
    ''
  ]) {
    assert.equal(fileAccessService.classify(bad), null, bad);
  }
});

test('validate() works when req.query is a read-only getter (Express 5)', () => {
  const req = {};
  Object.defineProperty(req, 'query', { get: () => ({ page: '2' }), configurable: true });
  let error;
  validate({ query: z.object({ page: z.coerce.number() }) })(req, {}, (e) => {
    error = e;
  });
  assert.equal(error, undefined);
  assert.equal(req.query.page, 2);
});

test('new passwords are limited to what bcrypt actually reads', () => {
  assert.equal(schemas.changePassword.safeParse({ newPassword: 'short' }).success, false);
  assert.equal(schemas.changePassword.safeParse({ newPassword: 'x'.repeat(73) }).success, false);
  assert.equal(schemas.changePassword.safeParse({ newPassword: 'a-fine-password' }).success, true);
});

test('professors must be created on the institutional domain', () => {
  assert.equal(schemas.createProfessor.safeParse({ name: 'P', email: 'p@gmail.com' }).success, false);
  assert.equal(schemas.createProfessor.safeParse({ name: 'P', email: 'p@iiti.ac.in' }).success, true);
});

test('server refuses to start with a published or placeholder JWT secret', () => {
  const run = (secret) =>
    spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, JWT_SECRET: secret },
      encoding: 'utf8'
    });
  assert.notEqual(run('replace-with-a-long-random-secret').status, 0);
  assert.notEqual(
    run('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30').status,
    0
  );
  assert.equal(run('x'.repeat(48)).status, 0);
});

test('file route: needs a token, and traversal attempts are 404', async () => {
  const adminId = 'a'.repeat(24);
  const original = User.findById;
  User.findById = () => ({
    select: () => ({ lean: async () => ({ _id: adminId, name: 'A', email: 'a@iiti.ac.in', role: 'admin' }) })
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/files`;
  try {
    assert.equal((await fetch(`${base}/attendance-images/x/y.jpg`)).status, 401);

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { subject: adminId, expiresIn: '1h' });
    const headers = { Authorization: `Bearer ${token}` };
    for (const path of [
      '../../etc/passwd',
      'attendance-images/..%2f..%2fetc/passwd',
      'attendance-images/%252e%252e/x.jpg',
      'temporary/x.jpg'
    ]) {
      const res = await fetch(`${base}/${path}`, { headers });
      assert.equal(res.status, 404, path);
    }
  } finally {
    User.findById = original;
    server.close();
  }
});

test('tokens issued before a password change are rejected', async () => {
  const id = 'b'.repeat(24);
  const original = User.findById;
  const changedAt = new Date();
  User.findById = () => ({
    select: () => ({
      lean: async () => ({ _id: id, name: 'P', email: 'p@iiti.ac.in', role: 'professor', passwordChangedAt: changedAt })
    })
  });
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/auth/me`;
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    // Issued an hour before the password changed: must be revoked.
    const forged = jwt.sign({ role: 'professor', iat: nowSeconds - 3600 }, process.env.JWT_SECRET, {
      subject: id,
      expiresIn: '2h'
    });
    // Issued after the change (what change-password hands back): still valid.
    const stale = jwt.sign({ role: 'professor' }, process.env.JWT_SECRET, { subject: id, expiresIn: '1h' });
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${forged}` } })).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${stale}` } })).status, 200);
  } finally {
    User.findById = original;
    server.close();
  }
});
