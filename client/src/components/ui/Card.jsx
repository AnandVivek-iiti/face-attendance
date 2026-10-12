export default function Card({ title, action, children, className = '', padded = true }) {
  return (
    <section className={`glass lift rounded-panel border border-line ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white/[0.03] px-4 py-3">
          <h2 className="font-serif text-base font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
