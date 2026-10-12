import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../services/attendanceService';
import { POLLING_STATUSES } from '../utils/constants';
import { getErrorMessage } from '../utils/errors';

const POLL_INTERVAL = 2500;

export function useSession(sessionId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const next = await getSession(sessionId);
        if (!alive.current) return null;
        setSession(next);
        setError(null);
        return next;
      } catch (err) {
        if (alive.current) setError(getErrorMessage(err));
        return null;
      } finally {
        if (alive.current && !silent) setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    alive.current = true;
    setSession(null);
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const polling = Boolean(session && POLLING_STATUSES.includes(session.status));

  useEffect(() => {
    if (!polling) return undefined;
    const timer = window.setInterval(() => load({ silent: true }), POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [polling, load]);

  return { session, loading, error, reload: load, polling };
}
