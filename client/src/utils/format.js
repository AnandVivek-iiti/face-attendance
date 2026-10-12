const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '';
}

export function toIsoDate(date) {
  const d = parseDate(date);
  if (!d) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function percent(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function ratio(part, whole) {
  if (!whole) return 0;
  return part / whole;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm || `${singular}s`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
