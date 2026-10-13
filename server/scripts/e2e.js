/* End-to-end: student registers with test-image.jpeg, professor approves, student
 * is enrolled and their attendance is visible. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const API = 'http://127.0.0.1:5000';
const IMAGE = path.join(__dirname, '..', '..', 'test-image.jpeg');

const buildMultipart = (fields, file) => {
  const boundary = '----smoke' + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    );
  }
  if (file) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    );
  }
  parts.push(`--${boundary}--\r\n`);
  const head = Buffer.from(parts.join(''));
  const tail = file ? Buffer.concat([head, file.data, Buffer.from('\r\n')]) : head;
  return { body: tail, contentType: `multipart/form-data; boundary=${boundary}` };
};

const request = (url, { method = 'GET', token, body, form } = {}) =>
  new Promise((resolve, reject) => {
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    };
    let payload = null;
    if (form) {
      const mp = buildMultipart(form.fields, form.file);
      payload = mp.body;
      headers['Content-Type'] = mp.contentType;
    } else if (body) {
      payload = Buffer.from(JSON.stringify(body));
    }
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const steps = [];
const ok = (name, detail) => steps.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
const fail = (name, detail) => steps.push(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);

const STUDENT = {
  email: 'student.test@iiti.ac.in',
  password: 'studentpass123',
  rollNumber: 'ME217001',
  name: 'Test Student'
};

const main = async () => {
  if (!fs.existsSync(IMAGE)) throw new Error(`test-image.jpeg not found at ${IMAGE}`);

  // 1. Student registers (first login sets the password).
  const registered = await request(`${API}/api/auth/login`, {
    method: 'POST',
    body: { email: STUDENT.email, password: STUDENT.password }
  });
  if (registered.status === 200) ok('student registered', `registered=${registered.json.registered}`);
  else fail('student registered', `${registered.status} ${registered.text.slice(0, 200)}`);
  const studentToken = registered.json?.data?.token;

  // 2. Student submits profile with the photo.
  const coursesResp = await request(`${API}/api/courses/available`, { token: studentToken });
  const me217 = coursesResp.json?.data?.find?.((c) => c.courseCode === 'ME217') || coursesResp.json?.data?.[0];
  if (!me217) throw new Error('ME217 not found in courses');

  const form = {
    fields: {
      rollNumber: STUDENT.rollNumber,
      name: STUDENT.name,
      year: '3',
      semester: '5',
      department: 'ME',
      courseId: me217._id || me217.id
    },
    file: { data: fs.readFileSync(IMAGE), filename: 'test-image.jpeg', contentType: 'image/jpeg' }
  };

  const profile = await request(`${API}/api/students/profile`, { method: 'POST', token: studentToken, form });
  if (profile.status === 201 || profile.status === 200) {
    ok('profile submitted', `enrolled=${profile.json?.data?.enrolled}`);
  } else {
    fail('profile submitted', `${profile.status} ${profile.text.slice(0, 300)}`);
  }
  const enrolled = profile.json?.data?.enrolled;
  const requestId = profile.json?.data?.request?._id || profile.json?.data?.request?.id;

  if (enrolled) {
    steps.push('INFO  student was already enrolled (re-run) — skipping approval path');
  } else if (!requestId) {
    fail('request raised', 'no request id in response');
  } else {
    // 3. Professor logs in with the auto password.
    const profLogin = await request(`${API}/api/auth/login`, {
      method: 'POST',
      body: { email: 'pradeep.kundu@iiti.ac.in', password: 'IIT@INDORE#ME217' }
    });
    if (profLogin.status === 200) ok('professor login', 'IIT@INDORE#ME217');
    else fail('professor login', `${profLogin.status} ${profLogin.text.slice(0, 200)}`);
    const profToken = profLogin.json?.data?.token;

    // 4. Professor sees the request.
    const listResp = await request(`${API}/api/enrollment-requests`, { token: profToken });
    const requests = listResp.json?.data || [];
    const mine = requests.find((r) => r.rollNumber === STUDENT.rollNumber);
    if (mine) ok('professor sees request', `${mine.name} (${mine.rollNumber})`);
    else fail('professor sees request', `found ${requests.length} requests`);

    // 5. Professor approves (ML derives the embedding from the photo).
    const approveResp = await request(`${API}/api/enrollment-requests/${requestId}/approve`, {
      method: 'POST',
      token: profToken,
      body: {}
    });
    if (approveResp.status === 200 || approveResp.status === 201) {
      ok('professor approved', `studentId=${approveResp.json?.data?.student?._id ? 'set' : '?'}`);
    } else {
      fail('professor approved', `${approveResp.status} ${approveResp.text.slice(0, 300)}`);
    }

    // 6. Student now sees attendance.
    const attendance = await request(`${API}/api/students/attendance`, { token: studentToken });
    if (attendance.status === 200) {
      ok('student attendance', `roll=${attendance.json?.data?.rollNumber} courses=${attendance.json?.data?.courses?.length ?? 0}`);
    } else {
      fail('student attendance', `${attendance.status} ${attendance.text.slice(0, 200)}`);
    }
  }

  console.log('\n' + steps.join('\n'));
  const failed = steps.filter((line) => line.startsWith('FAIL')).length;
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error('E2E ERROR', error.message);
  process.exit(1);
});
