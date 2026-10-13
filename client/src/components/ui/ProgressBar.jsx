export default function ProgressBar({ value, label, indeterminate = false }) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className="seg-track w-full"
    >
      <div className={`seg-fill ${indeterminate ? 'seg-ping' : ''}`} style={indeterminate ? undefined : { width }} />
    </div>
  );
}
