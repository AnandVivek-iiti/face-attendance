export default function Card({ title, action, children, className = '', padded = true, scan }) {
  return (
    <section className={`glass lift rounded-panel border border-line ${scan === 'loop' ? 'scan-loop' : scan ? 'scan-once' : ''} ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white/[0.03] px-5 py-3.5">
          <h2 className="card-title font-serif text-base font-bold tracking-tight text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}
