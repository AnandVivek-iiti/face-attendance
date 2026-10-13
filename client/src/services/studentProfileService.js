import http from './http';
import { unwrap } from '../utils/normalize';

export async function getProfile() {
  const payload = unwrap(await http.get('/api/students/profile'));
  return payload;
}

export async function buildProfile(values, imageFile) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  if (imageFile) form.append('image', imageFile);
  const payload = unwrap(await http.post('/api/students/profile', form, { timeout: 120000 }));
  return payload;
}

export async function getAttendance() {
  const payload = unwrap(await http.get('/api/students/attendance'));
  return payload;
}

export async function getMyRequests() {
  const payload = unwrap(await http.get('/api/students/requests'));
  return Array.isArray(payload) ? payload : payload?.requests ?? [];
}
