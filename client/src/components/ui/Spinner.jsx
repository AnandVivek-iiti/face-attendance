import AsciiSpinner from './AsciiSpinner';

export default function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 py-10 text-sm text-muted animate-fade ${className}`}
    >
      <AsciiSpinner className="text-primary" />
      <span>
        {label}
        <span className="dots" aria-hidden="true">...</span>
      </span>
    </div>
  );
}
