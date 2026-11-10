const tiles = [
  {
    key: 'facesFound',
    label: 'Detected',
    description: 'Faces found across all uploaded classroom photos.',
    accent: 'text-ink',
  },
  {
    key: 'enrolled',
    label: 'Total enrolled',
    description: 'Students registered in this course roster.',
    accent: 'text-ink',
  },
  {
    key: 'present',
    label: 'Present',
    description: 'Enrolled students currently marked present.',
    accent: 'text-ok',
  },
  {
    key: 'needsReview',
    label: 'Needs review',
    description: 'Matched students whose attendance needs verification.',
    accent: 'text-warn',
  },
  {
    key: 'absent',
    label: 'Absent',
    description: 'Enrolled students not currently marked present.',
    accent: 'text-bad',
  },
  {
    key: 'unmatched',
    label: 'Unknown / Enroll',
    description: 'Detected faces not linked to an enrolled student.',
    accent: 'text-warn',
  },
];

export default function SessionSummary({ summary, session }) {
  const metadata = [
    session?.imageCount != null ? `${session.imageCount} ${session.imageCount === 1 ? 'photo' : 'photos'}` : null,
    session?.createdAt ? `Created ${new Date(session.createdAt).toLocaleString()}` : null,
    session?.finalizedAt ? `Finalized ${new Date(session.finalizedAt).toLocaleString()}` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Attendance summary" className="glass animate-rise overflow-hidden rounded-panel border border-line">
      <dl className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.key} className="surface min-w-0 px-3 py-3 sm:px-4 sm:py-4">
            <dt className="text-[11px] leading-4 text-muted">{tile.label}</dt>
            <dd className={`mt-1 font-serif text-2xl font-bold tabular-nums ${tile.accent}`}>
              {summary[tile.key] ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-line bg-white/[0.025] px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <p key={`${tile.key}-description`} className="text-[11px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">{tile.label}:</span> {tile.description}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted">
        {metadata.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}
