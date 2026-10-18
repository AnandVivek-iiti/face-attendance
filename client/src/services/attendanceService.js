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
  await http.post(`/api/attendance/sessions/${sessionId}/analyze`, {}, { timeout: 300000 });
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
