require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../src/app');
const User = require('../src/models/User');

const ids = {
  admin: 'a'.repeat(24),
  professor: 'b'.repeat(24),
  student: 'c'.repeat(24)
};

const users = {
  [ids.admin]: { _id: ids.admin, name: 'Admin', email: 'a@x.io', role: 'admin' },
  [ids.professor]: { _id: ids.professor, name: 'Prof', email: 'p@x.io', role: 'professor' },
  [ids.student]: { _id: ids.student, name: 'Stu', email: 's@x.io', role: 'student', studentId: 'ME23001' }
};

const originalFindById = User.findById;
let server;
let base;

test.before(async () => {
  User.findById = (id) => ({ select: () => ({ lean: async () => users[id] || null }) });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  User.findById = originalFindById;
  server.close();
});

const tokenFor = (id, role) => jwt.sign({ role }, process.env.JWT_SECRET, { subject: id, expiresIn: '1h' });

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: await response.json() };
};

test('rejects missing and invalid tokens with the common error shape', async () => {
  const missing = await call('GET', '/students');
  assert.equal(missing.status, 401);
  assert.equal(missing.json.success, false);
  assert.equal(typeof missing.json.message, 'string');

  const invalid = await call('GET', '/students', { token: 'garbage' });
  assert.equal(invalid.status, 401);
});

test('rejects tokens signed with another secret', async () => {
  const forged = jwt.sign({ role: 'admin' }, 'x'.repeat(40), { subject: ids.admin });
  assert.equal((await call('GET', '/students', { token: forged })).status, 401);
});

test('login validates its body', async () => {
  const response = await call('POST', '/auth/login', { body: { email: 'not-an-email', password: '' } });
  assert.equal(response.status, 400);
  assert.equal(response.json.success, false);
});

test('login rejects non-iiti email domains', async () => {
  const response = await call('POST', '/auth/login', { body: { email: 'someone@gmail.com', password: 'password123' } });
  assert.equal(response.status, 400);
  assert.equal(response.json.code, 'INVALID_EMAIL_DOMAIN');
});

test('role checks block students and professors from admin routes', async () => {
  const studentToken = tokenFor(ids.student, 'student');
  const professorToken = tokenFor(ids.professor, 'professor');
  assert.equal((await call('GET', '/students', { token: studentToken })).status, 403);
  assert.equal((await call('POST', '/students', { token: professorToken, body: {} })).status, 403);
  assert.equal((await call('POST', '/courses', { token: professorToken, body: {} })).status, 403);
  assert.equal((await call('POST', '/attendance/sessions', { token: studentToken, body: {} })).status, 403);
  assert.equal((await call('POST', '/attendance/sessions', { token: tokenFor(ids.admin, 'admin'), body: {} })).status, 403);
  assert.equal((await call('GET', `/attendance/sessions/${'d'.repeat(24)}`, { token: studentToken })).status, 403);
});

test('admin payloads are validated', async () => {
  const token = tokenFor(ids.admin, 'admin');
  const response = await call('POST', '/students', { token, body: { name: 'x' } });
  assert.equal(response.status, 400);
  assert.equal(response.json.success, false);
});

test('record update body requires a valid status', async () => {
  const token = tokenFor(ids.professor, 'professor');
  const path = `/attendance/sessions/${'d'.repeat(24)}/records/ME23001`;
  assert.equal((await call('PUT', path, { token, body: {} })).status, 400);
  assert.equal((await call('PUT', path, { token, body: { status: 'late' } })).status, 400);
});

test('unknown routes return JSON 404', async () => {
  const response = await call('GET', '/nope', { token: tokenFor(ids.admin, 'admin') });
  assert.equal(response.status, 404);
  assert.equal(response.json.success, false);
});
