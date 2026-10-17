import { useEffect, useState } from 'react';

// The fill starts empty and eases to its value (index.css .seg-fill), both on
// first render and whenever the value changes.
export default function ProgressBar({ value, label, indeterminate = false }) {
  const target = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : target}
      className="seg-track w-full"
    >
      <div className={`seg-fill ${indeterminate ? 'seg-ping' : ''}`} style={indeterminate ? undefined : { width: `${shown}%` }} />
    </div>
  );
}
