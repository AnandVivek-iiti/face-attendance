import http from './http';
import { asList, normalizeCourse, unwrap } from '../utils/normalize';

// The server returns Mongo documents, which carry `_id` and no `id`.
const withId = (item) => ({ ...item, id: item.id ?? item._id });

// Courses the signed-in professor teaches (or every course, for an admin).
export async function getCourses() {
  return asList(unwrap(await http.get('/api/courses')), 'courses').map(normalizeCourse);
}

// Every course in the system. Students use this to pick a course to enroll in;
// /api/courses is staff-only.
export async function getAvailableCourses() {
  return asList(unwrap(await http.get('/api/courses/available')), 'courses').map(normalizeCourse);
}

export async function getCourse(id) {
  const payload = unwrap(await http.get(`/api/courses/${id}`));
  return normalizeCourse(payload.course ?? payload);
}

export async function createCourse(values) {
  const payload = unwrap(await http.post('/api/courses', values));
  return normalizeCourse(payload.course ?? payload);
}

export async function updateCourse(id, values) {
  const payload = unwrap(await http.put(`/api/courses/${id}`, values));
  return normalizeCourse(payload.course ?? payload);
}

export async function deleteCourse(id) {
  await http.delete(`/api/courses/${id}`);
}

export async function getProfessors() {
  return asList(unwrap(await http.get('/api/courses/professors')), 'professors').map(withId);
}

export async function addProfessor(values) {
  const payload = unwrap(await http.post('/api/courses/professors', values));
  return payload;
}

export async function getDepartments() {
  const payload = unwrap(await http.get('/api/departments'));
  return (Array.isArray(payload) ? payload : payload?.departments ?? []).map(withId);
}

export async function createDepartment(values) {
  const payload = unwrap(await http.post('/api/departments', values));
  return payload;
}

export async function updateDepartment(id, values) {
  const payload = unwrap(await http.put(`/api/departments/${id}`, values));
  return payload;
}

export async function deleteDepartment(id) {
  await http.delete(`/api/departments/${id}`);
}
