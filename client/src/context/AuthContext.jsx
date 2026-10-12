import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { AUTH_EXPIRED_EVENT } from '../services/http';
import { clearAuth, loadAuth, saveAuth } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => loadAuth());

  const signIn = useCallback(async (email, password) => {
    const result = await authService.login(email, password);
    saveAuth(result);
    setAuth(result);
    return result.user;
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  useEffect(() => {
    const handleExpired = () => setAuth(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const value = useMemo(
    () => ({ user: auth?.user ?? null, isAuthenticated: Boolean(auth?.user), signIn, signOut }),
    [auth, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
