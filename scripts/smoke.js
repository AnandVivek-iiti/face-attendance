/* End-to-end smoke test against the running ML service and server. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const API = 'http://127.0.0.1:5000';
const ML = 'http://127.0.0.1:8000';

const request = (url, { method = 'GET', token, body, form, headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const isForm = Boolean(form);
    const payload = form || (body ? Buffer.from(JSON.stringify(body)) : null);
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(isForm ? form.getHeaders() : {}),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (error) {
            /* not json */
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
const findPhoto = () => {
  const candidates = [
    path.join(__dirname, 'smoke-classroom.jpg'),
    path.join(__dirname, 'ml-service', 'tests', 'fixtures', 'classroom.jpg')
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
};

const login = async () => {
  const res = await request(`${API}/api/auth/login`, {
    method: 'POST',
    body: { email: 'professor@example.com', password: 'changeme1234' }
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text}`);
  return res.json.data.token;
};

const main = async () => {
  const steps = [];
  const ok = (name, detail) => {
    steps.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  };
  const fail = (name, detail) => {
    steps.push(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const health = await request(`${ML}/health`);
  if (health.status === 200) ok('ML health', health.json.embeddingModel);
  else fail('ML health', String(health.status));

  const token = await login();
  ok('login', 'professor@example.com');

  const courses = await request(`${API}/api/courses`, { token });
  const course = courses.json.data.find((c) => c.courseCode === 'ME217');
  if (course) ok('course ME217', course.courseName);
  else fail('course ME217', courses.text);

  const created = await request(`${API}/api/attendance/sessions`, {
    method: 'POST',
    token,
    body: { courseId: course._id, date: '2026-10-12' }
  });
  if (created.status === 201 || created.status === 200) ok('create session', created.json.data.id || created.json.data._id);
  else if (created.json?.error?.code === 'DUPLICATE_ATTENDANCE') {
    ok('create session', 'already exists (re-run) — reusing');
  } else {
    fail('create session', `${created.status} ${created.text}`);
  }

  const sessionId = created.json?.data?.id || created.json?.data?._id;
  if (!sessionId) {
    console.log(steps.join('\n'));
    process.exit(1);
  }

  const photo = findPhoto();
  if (!photo) {
    steps.push('SKIP  upload/analyze — no classroom photo found (place one at scripts/smoke-classroom.jpg)');
  } else {
    const form = new FormData();
    form.append('images', new Blob([fs.readFileSync(photo)], { type: 'image/jpeg' }), 'classroom.jpg');
    const uploaded = await request(`${API}/api/attendance/sessions/${sessionId}/images`, { method: 'POST', token, form });
    if (uploaded.status === 201 || uploaded.status === 200) ok('upload images', path.basename(photo));
    else fail('upload images', `${uploaded.status} ${uploaded.text}`);

    const analyzed = await request(`${API}/api/attendance/sessions/${sessionId}/analyze`, { method: 'POST', token, body: {} });
    if (analyzed.status === 200) {
      const data = analyzed.json.data;
      ok('analyze', `status=${data.session?.status} faces=${data.session?.faces?.length ?? 0} records=${data.records?.length ?? 0}`);
    } else {
      fail('analyze', `${analyzed.status} ${analyzed.text.slice(0, 300)}`);
    }
  }

  const review = await request(`${API}/api/attendance/sessions/${sessionId}`, { token });
  if (review.status === 200) {
    const data = review.json.data;
    ok('getSession', `status=${data.session.status} images=${data.session.images?.length} records=${data.records?.length}`);
    const firstFace = (data.session.faces || [])[0];
    if (firstFace) {
      ok('faces carry imageId+decision', `${firstFace.faceId} -> ${firstFace.decision}`);
    } else {
      steps.push('INFO  no faces detected (expected if the photo has no real faces)');
    }
  } else {
    fail('getSession', `${review.status} ${review.text.slice(0, 200)}`);
  }

  const exported = await request(`${API}/api/attendance/sessions/${sessionId}/export`, { token });
  if (exported.status === 200 && exported.text.includes('Roll Number')) ok('export session CSV', exported.text.split('\r\n')[0]);
  else fail('export session CSV', `${exported.status} ${exported.text.slice(0, 200)}`);

  const exportedAll = await request(`${API}/api/attendance/export`, { token });
  if (exportedAll.status === 200) ok('export all CSV', `${exportedAll.text.length} bytes`);
  else if (exportedAll.json?.error?.code === 'NOTHING_TO_EXPORT') ok('export all CSV', 'nothing yet (no finalized sessions)');
  else fail('export all CSV', `${exportedAll.status} ${exportedAll.text.slice(0, 200)}`);

  console.log(steps.join('\n'));
  const failed = steps.filter((line) => line.startsWith('FAIL')).length;
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error('SMOKE ERROR', error);
  process.exit(1);
});
