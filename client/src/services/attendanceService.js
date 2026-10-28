import http from './http';
import { asList, normalizeHistoryItem, normalizeSession, unwrap } from '../utils/normalize';

export async function createSession({ courseId, date }) {
  const payload = unwrap(await http.post('/api/attendance/sessions', { courseId, date }));
  return normalizeSession(payload.session ?? payload);
}

export async function uploadSessionImages(sessionId, files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  await http.post(`/api/attendance/sessions/${sessionId}/images`, form, {
    timeout: 300000,
    onUploadProgress: (event) => {
      if (event.total && onProgress) onProgress(event.loaded / event.total);
    },
  });
}

export async function analyzeSession(sessionId) {
  await http.post(`/api/attendance/sessions/${sessionId}/analyze`, {});
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForAnalysis(sessionId, { intervalMs = 2500, timeoutMs = 15 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let failures = 0;
  for (;;) {
    try {
      const payload = unwrap(await http.get(`/api/attendance/sessions/${sessionId}`));
      failures = 0;
      const session = payload.session ?? payload;
      if (session.status !== 'processing') {
        if (session.failure?.code) {
          throw Object.assign(new Error(session.failure.message), {
            response: { data: { code: session.failure.code, message: session.failure.message } },
          });
        }
        return;
      }
    } catch (error) {
      const status = error.response?.status;
      const retryable = !error.response?.data?.code && (!status || status >= 500);
      failures += 1;
      if (!retryable || failures >= 5) throw error;
    }
    if (Date.now() > deadline) {
      throw new Error('Analysis is taking longer than expected. Open the session later to see the result.');
    }
    await sleep(intervalMs);
  }
}

export async function getSession(sessionId) {
  const payload = unwrap(await http.get(`/api/attendance/sessions/${sessionId}`));
  // The server returns { session, records, warnings }.
  return normalizeSession({
    ...(payload.session ?? payload),
    records: payload.records ?? payload.session?.records ?? [],
    warnings: payload.warnings ?? payload.session?.warnings ?? [],
  });
}

export async function updateRecord(sessionId, studentId, values) {
  await http.put(
    `/api/attendance/sessions/${sessionId}/records/${encodeURIComponent(studentId)}`,
    values,
  );
}

export async function assignFace(sessionId, faceId, values) {
  const payload = unwrap(
    await http.post(`/api/attendance/sessions/${sessionId}/faces/${encodeURIComponent(faceId)}/assign`, values),
  );
  return payload;
}

// Enroll many faces in ONE request.
export async function assignFaces(sessionId, assignments) {
  return unwrap(
    await http.post(`/api/attendance/sessions/${sessionId}/faces/assign`, { assignments }, { timeout: 120000 }),
  );
}

export async function exportSessionCsv(sessionId) {
  return http.get(`/api/attendance/sessions/${sessionId}/export`, { responseType: 'text' });
}

export async function exportAllCsv() {
  return http.get('/api/attendance/export', { responseType: 'text' });
}

export async function finalizeSession(sessionId) {
  await http.post(`/api/attendance/sessions/${sessionId}/finalize`, {});
}

export async function deleteSession(sessionId) {
  const payload = unwrap(await http.delete(`/api/attendance/sessions/${sessionId}`));
  return payload;
}

export async function getHistory() {
  const payload = unwrap(await http.get('/api/attendance/history', { params: { limit: 100 } }));
  // Students get `records`, professors/admins get `sessions`.
  return asList(payload, 'records', 'history', 'sessions').map(normalizeHistoryItem);
}
