import http from './http';
import { asList, normalizeCourse, unwrap } from '../utils/normalize';

export async function getCourses() {
  return asList(unwrap(await http.get('/api/courses')), 'courses').map(normalizeCourse);
}

export async function getCourse(id) {
  const payload = unwrap(await http.get(`/api/courses/${id}`));
  return normalizeCourse(payload.course ?? payload);
}

export async function createCourse(values) {
  const payload = unwrap(await http.post('/api/courses', values));
  return normalizeCourse(payload.course ?? payload);
}
