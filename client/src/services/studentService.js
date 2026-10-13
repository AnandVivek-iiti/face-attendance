import http from './http';
import { asList, normalizeStudent, unwrap, unwrapWithMeta } from '../utils/normalize';

// The server pages results (max 100). Fetch every page so a class of 56+ is never cut off.
export async function getStudents() {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { data, pagination } = unwrapWithMeta(await http.get('/api/students', { params: { page, limit: 100 } }));
    all.push(...asList(data, 'students'));
    totalPages = pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= 20);
  return all.map(normalizeStudent);
}

export async function getStudent(id) {
  const payload = unwrap(await http.get(`/api/students/${id}`));
  return normalizeStudent(payload.student ?? payload);
}

export async function createStudent(values) {
  const payload = unwrap(await http.post('/api/students', values));
  return normalizeStudent(payload.student ?? payload);
}

export async function updateStudent(id, values) {
  const payload = unwrap(await http.put(`/api/students/${id}`, values));
  return normalizeStudent(payload.student ?? payload);
}

export async function deleteStudent(id) {
  await http.delete(`/api/students/${id}`);
}

export async function uploadStudentFaces(id, files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  await http.post(`/api/students/${id}/face`, form, {
    timeout: 120000,
    onUploadProgress: (event) => {
      if (event.total && onProgress) onProgress(event.loaded / event.total);
    },
  });
}

export async function generateStudentEmbedding(id) {
  await http.post(`/api/students/${id}/face/embedding`, {}, { timeout: 120000 });
}
