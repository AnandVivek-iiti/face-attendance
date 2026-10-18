// Skeleton loader (kept under the old Spinner name so every call site works).

const Bar = ({ className = '' }) => <div className={`skeleton rounded-ctl ${className}`} />;

function Rows({ count = 4 }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-panel border border-line">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 px-4 py-3.5 animate-rise"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <Bar className="h-9 w-9 shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="h-3 w-2/5" />
            <Bar className="h-2.5 w-3/5" />
          </div>
          <Bar className="h-6 w-16 !rounded-full" />
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="glass rounded-panel border border-line p-5 animate-rise"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className="flex items-center gap-3">
              <Bar className="h-9 w-9" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="mt-5 h-9 w-20" />
            <Bar className="mt-3 h-2.5 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="glass animate-rise rounded-panel border border-line" style={{ animationDelay: `${380 + card * 90}ms` }}>
            <div className="border-b border-line px-5 py-4">
              <Bar className="h-4 w-1/3" />
            </div>
            <div className="p-4">
              <Rows count={3} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Spinner({ label = 'Loading', className = '', variant = 'rows' }) {
  return (
    <div role="status" className={`animate-fade ${className}`}>
      <span className="sr-only">{label}</span>
      {variant === 'dashboard' ? <Dashboard /> : <Rows />}
      <p aria-hidden="true" className="mt-4 text-center text-xs text-muted">
        {label}
        <span className="dots">...</span>
      </p>
    </div>
  );
}
