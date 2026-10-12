export default function ProgressBar({ value, label, indeterminate = false }) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/10"
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-lime-300 bg-[length:250%_100%] ${
          indeterminate
            ? 'w-1/3 animate-indeterminate'
            : 'animate-progress transition-[width] duration-500 ease-out'
        }`}
        style={indeterminate ? undefined : { width }}
      />
    </div>
  );
}
