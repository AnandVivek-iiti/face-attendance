import StudentAttendanceRow from './StudentAttendanceRow';

export default function AttendanceTable({
  rows,
  variant = 'detected',
  readOnly,
  manualMode,
  selectedIds,
  activeStudentId,
  imageById,
  sizes,
  onToggleSelect,
  onToggleAll,
  onPresent,
  onAbsent,
  onChange,
  onIgnore,
  onFocus,
  caption,
}) {
  const showAi = variant !== 'undetected';
  const selectable = manualMode && !readOnly;
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.studentId));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="surface border-b border-line text-xs font-semibold text-muted">
            {selectable && (
              <th scope="col" className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(rows)}
                  aria-label="Select all rows"
                />
              </th>
            )}
            <th scope="col" className="px-2 py-2">Roll Number</th>
            <th scope="col" className="px-2 py-2">Name</th>
            {showAi && <th scope="col" className="px-2 py-2">AI Result</th>}
            {showAi && <th scope="col" className="px-2 py-2">Confidence</th>}
            <th scope="col" className="px-2 py-2">Source</th>
            <th scope="col" className="px-2 py-2">Final Status</th>
            <th scope="col" className="px-2 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="stagger">
          {rows.map((row) => (
            <StudentAttendanceRow
              key={row.studentId}
              row={row}
              variant={variant}
              readOnly={readOnly}
              manualMode={manualMode}
              selected={selectedIds.has(row.studentId)}
              active={activeStudentId === row.studentId}
              image={row.face ? imageById[row.face.imageId] : null}
              size={row.face ? sizes[row.face.imageId] : null}
              onToggleSelect={onToggleSelect}
              onPresent={onPresent}
              onAbsent={onAbsent}
              onChange={onChange}
              onIgnore={onIgnore}
              onFocus={onFocus}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
