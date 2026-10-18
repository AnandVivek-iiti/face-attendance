import { useEffect, useState } from 'react';

// url -> 'ok' | 'error' once settled; url -> Promise while in flight.
const settled = new Map();
const inflight = new Map();

export function preloadImage(url) {
  if (!url) return Promise.resolve('error');
  if (settled.has(url)) return Promise.resolve(settled.get(url));
  if (!inflight.has(url)) {
    inflight.set(
      url,
      new Promise((resolve) => {
        const element = new Image();
        const finish = (state) => {
          inflight.delete(url);
          // Failures are not cached, so a retry (reload) can succeed later.
          if (state === 'ok') settled.set(url, state);
          resolve(state);
        };
        element.onload = () => {
          // decode() resolves only when the pixels are ready to paint, so the crop never shows half-rendered.
          const decoded = element.decode ? element.decode().catch(() => {}) : Promise.resolve();
          decoded.then(() => finish('ok'));
        };
        element.onerror = () => finish('error');
        element.src = url;
      }),
    );
  }
  return inflight.get(url);
}

// 'loading' until the image is FULLY loaded and decoded, then 'ok' (or 'error').
export function useImageReady(url) {
  const [state, setState] = useState(() => (url && settled.has(url) ? 'ok' : 'loading'));

  useEffect(() => {
    if (!url) {
      setState('loading');
      return undefined;
    }
    if (settled.has(url)) {
      setState('ok');
      return undefined;
    }
    let alive = true;
    setState('loading');
    preloadImage(url).then((result) => alive && setState(result));
    return () => {
      alive = false;
    };
  }, [url]);

  return state;
}
