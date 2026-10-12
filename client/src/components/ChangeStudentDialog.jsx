import { useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { SearchInput } from './ui/Field';
import FaceCrop from './FaceCrop';

export default function ChangeStudentDialog({ open, face, fromRow, rows, image, size, onConfirm, onCancel }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(null);
    }
  }, [open]);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => row.studentId !== fromRow?.studentId)
      .filter(
        (row) =>
          !term || row.name.toLowerCase().includes(term) || String(row.rollNumber).toLowerCase().includes(term),
      );
  }, [rows, query, fromRow]);

  return (
    <Modal
      open={open}
      title="Change student"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!selected} onClick={() => onConfirm(selected)}>
            Assign face to student
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <FaceCrop image={image} size={size} face={face} width={56} />
        <p className="text-sm text-ink">
          {fromRow
            ? `The AI matched this face to ${fromRow.name}. Choose the correct student.`
            : 'Choose the student this face belongs to.'}
        </p>
      </div>
      <SearchInput value={query} onChange={setQuery} placeholder="Search by name or roll number" label="Search students" />
      <ul className="surface mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-ctl border border-line" role="radiogroup" aria-label="Students">
        {candidates.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No students match.</li>}
        {candidates.map((row) => (
          <li key={row.studentId}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]">
              <input
                type="radio"
                name="student"
                checked={selected === row.studentId}
                onChange={() => setSelected(row.studentId)}
              />
              <span className="font-semibold text-ink">{row.name}</span>
              <span className="ml-auto tabular-nums text-muted">{row.rollNumber}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
