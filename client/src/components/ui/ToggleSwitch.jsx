export default function ToggleSwitch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm font-semibold text-ink disabled:opacity-50"
    >
      <span
        className={`relative h-5 w-9 rounded-full border transition-colors duration-200 ${
          checked ? 'border-primary/60 bg-primary' : 'border-white/25 bg-white/25'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full shadow transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            checked ? 'translate-x-4 bg-primary-ink' : 'translate-x-0 bg-white'
          }`}
        />
      </span>
      {label}
    </button>
  );
}
