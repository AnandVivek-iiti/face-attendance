import http from './http';
import { normalizeUser, unwrap } from '../utils/normalize';

export async function login(email, password) {
  const payload = unwrap(await http.post('/api/auth/login', { email, password }));
  return {
    token: payload.token ?? payload.accessToken ?? null,
    user: normalizeUser(payload.user ?? payload),
  };
}
