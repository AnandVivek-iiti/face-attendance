import { useEffect, useRef, useState } from 'react';

const NUMERIC = /^(-?\d+(?:\.\d+)?)(\D*)$/;

function parseValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = String(value);
    const decimals = (text.split('.')[1] || '').length;
    return { target: value, decimals, suffix: '' };
  }
  if (typeof value === 'string') {
    const match = NUMERIC.exec(value.trim());
    if (match) {
      return { target: Number(match[1]), decimals: (match[1].split('.')[1] || '').length, suffix: match[2] };
    }
  }
  return null;
}

const formatValue = (number, parsed) => `${number.toFixed(parsed.decimals)}${parsed.suffix}`;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts a numeric value (a number, or text like "87%") to its target on mount and on change. */
export function useCountUp(value, duration = 1100) {
  const parsed = parseValue(value);
  const current = useRef(0);
  const [display, setDisplay] = useState(() => (parsed ? formatValue(0, parsed) : value));

  useEffect(() => {
    if (!parsed) {
      current.current = 0;
      setDisplay(value);
      return undefined;
    }
    if (reducedMotion() || current.current === parsed.target) {
      current.current = parsed.target;
      setDisplay(value);
      return undefined;
    }

    const from = current.current;
    const to = parsed.target;
    const start = performance.now();
    let frame;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = from + (to - from) * eased;
      current.current = next;
      setDisplay(progress < 1 ? formatValue(next, parsed) : value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

export default function CountUp({ value, duration, className = '' }) {
  const display = useCountUp(value, duration);
  return <span className={`tabular-nums ${className}`}>{display}</span>;
}
