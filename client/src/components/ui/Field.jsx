import { useId } from 'react';

// Always occupies one line, so a hint or error appearing mid-typing cannot
// change the height of the form and shove the field under the caret.
function Message({ hint, error }) {
  return (
    <p role={error ? 'alert' : undefined} className={`mt-1 min-h-4 text-xs leading-4 ${error ? 'text-bad' : 'text-muted'}`}>
      {error || hint || '\u00a0'}
    </p>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, className = '', hideLabel = false, ...rest }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-semibold text-ink'}>
        {label}
      </label>
      <input id={id} className={`control ${className}`} aria-invalid={Boolean(error)} {...rest} />
      <Message hint={hint} error={error} />
    </div>
  );
}

export function Select({ label, hint, error, children, ...rest }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} className="control" aria-invalid={Boolean(error)} {...rest}>
        {children}
      </select>
      <Message hint={hint} error={error} />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="control max-w-xs"
    />
  );
}
