import { useMemo, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import AttendanceTable from './AttendanceTable';
import NotDetectedPanel from './NotDetectedPanel';
import UnmatchedFacesPanel from './UnmatchedFacesPanel';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import { SearchInput } from './ui/Field';
import { DECISION } from '../utils/constants';

const filters = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
];

function applyFilter(rows, filter, query) {
  const term = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'needs_review' && row.aiResult !== DECISION.REVIEW) return false;
    if (filter === 'present' && row.status !== 'present') return false;
    if (filter === 'absent' && row.status === 'present') return false;
    if (!term) return true;
    return row.name.toLowerCase().includes(term) || String(row.rollNumber).toLowerCase().includes(term);
  });
}

export default function ReviewPanel({
  review,
  readOnly,
  manualMode,
  imageById,
  sizes,
  activeStudentId,
  selectedFaceKey,
  handlers,
  onAddStudent,
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const detected = useMemo(
    () => review.rows.filter((row) => row.face || row.changed),
    [review.rows],
  );
  const notDetected = useMemo(
    () => review.rows.filter((row) => !row.face && !row.changed),
    [review.rows],
  );
  const visible = useMemo(
    () => applyFilter(manualMode ? review.rows : detected, filter, query),
    [manualMode, review.rows, detected, filter, query],
  );

  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (rows) =>
    setSelected((current) => {
      const everySelected = rows.every((row) => current.has(row.studentId));
      return everySelected ? new Set() : new Set(rows.map((row) => row.studentId));
    });

  const bulk = (status) => {
    handlers.onBulk([...selected], status);
    setSelected(new Set());
  };

  const tableProps = {
    readOnly,
    manualMode,
    selectedIds: selected,
    activeStudentId,
    imageById,
    sizes,
    onToggleSelect: toggle,
    onToggleAll: toggleAll,
    onPresent: handlers.onPresent,
    onAbsent: handlers.onAbsent,
    onChange: handlers.onChange,
    onIgnore: handlers.onIgnore,
    onFocus: handlers.onFocus,
  };

  const showNotDetected = !manualMode && notDetected.length > 0;
  const undetectedRows = showNotDetected ? applyFilter(notDetected, filter === 'needs_review' ? 'all' : filter, query) : [];

  return (
    <div className="space-y-4">
      <section className="glass animate-rise rounded-panel border border-line">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white/[0.03] px-4 py-3">
          <h2 className="font-serif text-base font-semibold text-ink">
            {manualMode ? 'All enrolled students' : 'Detected students'}
          </h2>
          <div className="flex gap-1" role="group" aria-label="Filter rows">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 ${
                  filter === item.id
                    ? 'border-primary bg-primary text-primary-ink shadow-glass'
                    : 'border-line bg-white/10 text-ink hover:bg-white/[0.16]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search students" label="Search students in table" />
            {manualMode && !readOnly && (
              <Button icon={UserPlus} onClick={onAddStudent}>
                Add missing student
              </Button>
            )}
          </div>
        </header>

        {manualMode && !readOnly && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-primary-soft px-4 py-2 text-sm">
            <span className="font-semibold text-ink">{selected.size} selected</span>
            <Button size="sm" icon={Check} onClick={() => bulk('present')}>
              Mark present
            </Button>
            <Button size="sm" icon={X} onClick={() => bulk('absent')}>
              Mark absent
            </Button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            title={detected.length === 0 && !manualMode ? 'No students were identified' : 'No students match this filter'}
            description={
              detected.length === 0 && !manualMode
                ? 'Mark students from the list below, or switch on Manual Attendance Mode.'
                : 'Clear the search or choose another filter.'
            }
          />
        ) : (
          <AttendanceTable
            {...tableProps}
            rows={visible}
            variant={manualMode ? 'all' : 'detected'}
            caption="Attendance records"
          />
        )}
      </section>

      {!manualMode && (
        <UnmatchedFacesPanel
          faces={review.unmatchedFaces}
          readOnly={readOnly}
          imageById={imageById}
          sizes={sizes}
          selectedKey={selectedFaceKey}
          onSelect={handlers.onSelectFace}
          onAssign={handlers.onAssignFace}
          onDismiss={handlers.onDismissFace}
        />
      )}

      {showNotDetected && undetectedRows.length > 0 && <NotDetectedPanel {...tableProps} rows={undetectedRows} />}
    </div>
  );
}
