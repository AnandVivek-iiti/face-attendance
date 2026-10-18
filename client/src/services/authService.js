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
    return { googleEnabled: false, emailEnabled: false };
  }
}

// Ask the server to email a one-time sign-in link.
export async function requestMagicLink(email) {
  return unwrap(await http.post('/api/auth/magic-link', { email }));
}

// Professor self-service: edit name/department (requires a verified email).
export async function updateProfile(values) {
  const payload = unwrap(await http.patch('/api/auth/profile', values));
  return normalizeUser(payload.user ?? payload);
}

// Change password; the server returns a fresh token because older ones stop working once the password changes.
export async function changePassword(values) {
  const payload = unwrap(await http.post('/api/auth/change-password', values));
  return {
    token: payload.token ?? payload.accessToken ?? null,
    user: normalizeUser(payload.user ?? payload),
  };
}

// Resolves the account behind the currently stored token.
export async function me() {
  const payload = unwrap(await http.get('/api/auth/me'));
  return normalizeUser(payload.user ?? payload);
}
