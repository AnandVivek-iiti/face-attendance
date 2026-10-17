export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        <h1 className="display font-serif text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <span aria-hidden="true" className="title-bar" />
        {description && <p className="mt-3 max-w-2xl text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
