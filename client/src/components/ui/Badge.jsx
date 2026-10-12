const tones = {
  ok: 'border-ok-line bg-ok-soft text-ok',
  warn: 'border-warn-line bg-warn-soft text-warn',
  bad: 'border-bad-line bg-bad-soft text-bad',
  info: 'border-primary/30 bg-primary-soft text-primary',
  neutral: 'border-line bg-white/10 text-muted',
};

export default function Badge({ tone = 'neutral', icon: Icon, children, className = '', borderStyle = 'solid' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-colors ${tones[tone]} ${className}`}
      style={{ borderStyle }}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
