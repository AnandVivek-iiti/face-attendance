const KEY = 'face-attendance.auth';

export function loadAuth() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(value) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

export function clearAuth() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
}
