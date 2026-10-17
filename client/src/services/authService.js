import http from './http';
import { normalizeUser, unwrap } from '../utils/normalize';

export async function login(email, password) {
  const payload = unwrap(await http.post('/api/auth/login', { email, password }));
  return {
    token: payload.token ?? payload.accessToken ?? null,
    user: normalizeUser(payload.user ?? payload),
  };
}

export async function getAuthConfig() {
  try {
    return unwrap(await http.get('/api/auth/config'));
  } catch {
    return { googleEnabled: false };
  }
}

// Resolves the account behind the currently stored token. Used right after the
// Google redirect, which hands the client a token but not the user.
export async function me() {
  const payload = unwrap(await http.get('/api/auth/me'));
  return normalizeUser(payload.user ?? payload);
}
