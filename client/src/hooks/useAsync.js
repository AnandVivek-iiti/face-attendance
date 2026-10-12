import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../utils/errors';

export function useAsync(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tick = useRef(0);

  const run = useCallback(async () => {
    const current = ++tick.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (current === tick.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (current === tick.current) {
        setState((prev) => ({ ...prev, loading: false, error: getErrorMessage(error) }));
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) run();
    return () => {
      tick.current += 1;
    };
  }, [enabled, run, ...deps]);

  return { ...state, reload: run };
}
