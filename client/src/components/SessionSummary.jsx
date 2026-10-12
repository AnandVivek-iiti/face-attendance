const tiles = [
  { key: 'enrolled', label: 'Total enrolled' },
  { key: 'detected', label: 'Detected' },
  { key: 'highConfidence', label: 'High confidence' },
  { key: 'needsReview', label: 'Needs review' },
  { key: 'notDetected', label: 'Not detected' },
  { key: 'present', label: 'Present', accent: 'text-ok' },
  { key: 'absent', label: 'Absent', accent: 'text-bad' },
];

export default function SessionSummary({ summary }) {
  return (
    <section aria-label="Attendance summary" className="glass animate-rise rounded-panel border border-line">
      <dl className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
        {tiles.map((tile) => (
          <div key={tile.key} className="surface px-4 py-3">
            <dt className="text-xs text-muted">{tile.label}</dt>
            <dd className={`font-serif text-2xl font-bold tabular-nums ${tile.accent ?? 'text-ink'}`}>
              {summary[tile.key]}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-2 text-sm text-muted">
        {summary.facesFound} {summary.facesFound === 1 ? 'face' : 'faces'} found in the photographs
        {summary.unmatched > 0 &&
          `, ${summary.unmatched} not matched to an enrolled student`}
        .
      </p>
    </section>
  );
}
