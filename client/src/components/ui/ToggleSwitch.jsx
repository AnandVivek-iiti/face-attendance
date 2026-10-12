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
          className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-all duration-200 ease-out ${
            checked ? 'left-[18px] bg-primary-ink' : 'left-0.5 bg-white'
          }`}
        />
      </span>
      {label}
    </button>
  );
}
