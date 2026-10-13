import AsciiSpinner from './AsciiSpinner';

const variants = {
  primary:
    'bg-primary text-primary-ink border-primary hover:bg-primary-dark shadow-glass',
  secondary:
    'bg-white/10 text-ink border-line hover:bg-white/[0.16] hover:border-white/25',
  danger: 'bg-bad-dark text-white border-bad-dark hover:brightness-110',
  ghost: 'bg-transparent text-primary border-transparent hover:bg-primary-soft',
};

const sizes = {
  sm: 'px-2.5 py-1 text-xs gap-1',
  md: 'px-3.5 py-2 text-sm gap-1.5',
  lg: 'px-5 py-2.5 text-base gap-2',
};

export default function Button({
  as: Tag = 'button',
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  children,
  className = '',
  disabled,
  ...rest
}) {
  const isButton = Tag === 'button';
  return (
    <Tag
      {...(isButton ? { type: rest.type || 'button', disabled: disabled || loading } : {})}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-ctl border font-semibold transition-colors duration-150 ease-out hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <AsciiSpinner />
      ) : (
        Icon && <Icon size={size === 'sm' ? 12 : 16} aria-hidden="true" />
      )}
      {children}
    </Tag>
  );
}
