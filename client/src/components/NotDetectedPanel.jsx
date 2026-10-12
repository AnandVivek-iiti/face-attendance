import AttendanceTable from './AttendanceTable';
import { plural } from '../utils/format';

export default function NotDetectedPanel({ rows, readOnly, ...tableProps }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="not-detected-heading" className="glass animate-rise rounded-panel border border-line">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/[0.03] px-4 py-3">
        <div>
          <h3 id="not-detected-heading" className="font-serif text-base font-semibold text-ink">
            Not detected, {rows.length} {plural(rows.length, 'student')}
          </h3>
          <p className="text-xs text-muted">Enrolled in this course but not identified in any photograph.</p>
        </div>
      </header>
      <AttendanceTable
        rows={rows}
        variant="undetected"
        readOnly={readOnly}
        caption="Students not detected by the AI"
        {...tableProps}
      />
    </section>
  );
}
