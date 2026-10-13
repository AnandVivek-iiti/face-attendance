import axios from 'axios';
import { clearAuth, loadAuth } from '../utils/storage';
import { getErrorMessage } from '../utils/errors';

export const AUTH_EXPIRED_EVENT = 'face-attendance:auth-expired';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  // Auth is a bearer token, not a cookie. Sending credentials would trigger a
  // CORS preflight that the server would reject without credentials:true.
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const auth = loadAuth();
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/api/auth/login');
    if (error.response?.status === 401 && !isLogin) {
      clearAuth();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    // Axios' own message is just "Request failed with status code 400", which
    // hides WHY. Put the server's real reason (e.g. "Validation failed -
    // department: ...") into error.message so every `err.message` in the app
    // shows something the user can act on.
    if (error.response) {
      const reason = getErrorMessage(error, '');
      if (reason) error.message = reason;
    }
    return Promise.reject(error);
  },
);

export default http;
