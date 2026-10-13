import { useEffect, useState } from 'react';

const FRAMES = ['|', '/', '-', '\\'];

/** Classic one-character terminal spinner. Fixed 1ch width so nothing shifts. */
export default function AsciiSpinner({ className = '' }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setFrame((n) => (n + 1) % FRAMES.length), 110);
    return () => clearInterval(timer);
  }, []);
  return (
    <span aria-hidden="true" className={`inline-block w-[1ch] text-center font-bold ${className}`}>
      {FRAMES[frame]}
    </span>
  );
}
