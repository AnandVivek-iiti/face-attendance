export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-fade">
      {Icon && (
        <span className="float-slow mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white/5 text-primary">
          <Icon size={24} aria-hidden="true" />
        </span>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
