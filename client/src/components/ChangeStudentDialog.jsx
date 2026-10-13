import { useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { SearchInput, TextInput } from './ui/Field';
import FaceCrop from './FaceCrop';

/**
 * Lets the professor point a detected face at a student. If the roll number is
 * not on the roster yet, filling in a name enrolls them on the spot — this is
 * how a course's very first attendance builds its student list.
 */
export default function ChangeStudentDialog({ open, face, fromRow, rows, image, size, onConfirm, onCancel }) {
  const [mode, setMode] = useState('existing');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      // First session has no roster, so the existing-student list is empty —
      // start on the tab the professor actually needs.
      setMode(rows && rows.length ? 'existing' : 'new');
      setQuery('');
      setSelected(null);
      setRollNumber('');
      setName('');
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

  const existing = rows.some((row) => String(row.rollNumber).toLowerCase() === rollNumber.trim().toLowerCase());
  const canConfirm = mode === 'existing' ? Boolean(selected) : rollNumber.trim() && name.trim() && !existing;

  const confirm = () => {
    if (mode === 'existing') {
      onConfirm({ type: 'existing', studentId: selected });
      return;
    }
    onConfirm({ type: 'new', rollNumber: rollNumber.trim(), name: name.trim() });
  };

  return (
    <Modal
      open={open}
      title="Assign face to student"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!canConfirm} onClick={confirm}>
            {mode === 'new' ? 'Enroll and mark present' : 'Assign face'}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <FaceCrop image={image} size={size} face={face} width={56} />
        <p className="text-sm text-ink">
          {fromRow
            ? `The AI matched this face to ${fromRow.name}. Choose the correct student.`
            : 'Choose the student this face belongs to, or enroll a new one.'}
        </p>
      </div>

      <div className="mb-3 flex gap-2" role="tablist" aria-label="Assign mode">
        <Button
          size="sm"
          variant={mode === 'existing' ? 'primary' : 'ghost'}
          onClick={() => setMode('existing')}
          role="tab"
          aria-selected={mode === 'existing'}
        >
          Existing student
        </Button>
        <Button
          size="sm"
          variant={mode === 'new' ? 'primary' : 'ghost'}
          onClick={() => setMode('new')}
          role="tab"
          aria-selected={mode === 'new'}
        >
          New student
        </Button>
      </div>

      {mode === 'existing' ? (
        <>
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
        </>
      ) : (
        <div className="space-y-3">
          <TextInput
            label="Roll number"
            value={rollNumber}
            onChange={(event) => setRollNumber(event.target.value)}
            placeholder="e.g. ME217001"
            hint={existing ? 'This roll number is already on the roster — switch to the existing student instead.' : undefined}
          />
          <TextInput
            label="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Aditi Sharma"
          />
        </div>
      )}
    </Modal>
  );
}
