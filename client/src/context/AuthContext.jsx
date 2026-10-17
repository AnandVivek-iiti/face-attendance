import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { getProfile } from '../services/studentProfileService';
import { AUTH_EXPIRED_EVENT } from '../services/http';
import { clearAuth, loadAuth, saveAuth } from '../utils/storage';
import { normalizeUser } from '../utils/normalize';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => loadAuth());

  const signIn = useCallback(async (email, password) => {
    const result = await authService.login(email, password);
    saveAuth(result);
    setAuth(result);
    return result.user;
  }, []);

  // Completes the Google redirect: the server hands the browser a bare JWT.
  // Persist it first so the http interceptor attaches it, then resolve the user.
  const signInWithToken = useCallback(async (token) => {
    saveAuth({ token });
    const user = await authService.me();
    const result = { token, user };
    saveAuth(result);
    setAuth(result);
    return user;
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  // Re-read the student's canonical profile state from the server (used right
  // after profile setup saves, so the gate opens without forcing a re-login).
  const refreshUser = useCallback(async () => {
    const current = loadAuth();
    if (!current?.user || current.user.role !== 'student') return current?.user ?? null;
    const data = await getProfile();
    const nextUser = normalizeUser({
      ...current.user,
      profile: data.profile ?? current.user.profile,
      studentId: data.studentId ?? data.linkedStudent?._id ?? current.user.studentId,
      profileComplete: data.profileComplete,
    });
    const next = { ...current, user: nextUser };
    saveAuth(next);
    setAuth(next);
    return nextUser;
  }, []);

  useEffect(() => {
    const handleExpired = () => setAuth(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const value = useMemo(
    () => ({
      user: auth?.user ?? null,
      isAuthenticated: Boolean(auth?.user),
      signIn,
      signInWithToken,
      signOut,
      refreshUser,
    }),
    [auth, signIn, signInWithToken, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
