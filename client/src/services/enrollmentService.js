import http from './http';
import { unwrap } from '../utils/normalize';

export async function getPendingRequests() {
  const payload = unwrap(await http.get('/api/enrollment-requests'));
  return Array.isArray(payload) ? payload : payload?.requests ?? [];
}

export async function approveRequest(id, note) {
  const payload = unwrap(await http.post(`/api/enrollment-requests/${id}/approve`, { note }));
  return payload;
}

export async function rejectRequest(id, note) {
  const payload = unwrap(await http.post(`/api/enrollment-requests/${id}/reject`, { note }));
  return payload;
}
