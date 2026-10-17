import CountUp from './CountUp';

const TONE = { ok: 'stat-ok', bad: 'stat-bad', warn: 'stat-warn' };

export default function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className={`stat glass lift rounded-panel border border-line p-5 pb-6 ${TONE[tone] ?? ''}`}>
      <div className="flex items-center gap-3 text-sm font-semibold text-muted">
        {Icon && (
          <span className="stat-icon flex h-9 w-9 items-center justify-center rounded-ctl border border-primary/30 text-primary">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <span>{label}</span>
      </div>
      <p className="stat-value mt-4 font-serif">
        <CountUp value={value} />
      </p>
      {hint && <p className="mt-2 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}
