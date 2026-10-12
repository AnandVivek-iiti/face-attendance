import { useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';
import ErrorState from './ui/ErrorState';
import { SearchInput } from './ui/Field';
import { useAsync } from '../hooks/useAsync';
import { getStudents } from '../services/studentService';

export default function AddStudentDialog({ open, existingIds, onConfirm, onCancel }) {
  const { data, loading, error, reload } = useAsync(getStudents, [], { enabled: open });
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
    return (data ?? [])
      .filter((student) => !existingIds.has(student.studentId))
      .filter(
        (student) =>
          !term || student.name.toLowerCase().includes(term) || String(student.rollNumber).toLowerCase().includes(term),
      )
      .slice(0, 100);
  }, [data, existingIds, query]);

  return (
    <Modal
      open={open}
      title="Add missing student"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!selected} onClick={() => onConfirm(selected)}>
            Add as present
          </Button>
        </>
      }
    >
      {loading && <Spinner label="Loading students" />}
      {error && <ErrorState title="Could not load students" message={error} onRetry={reload} />}
      {data && (
        <>
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name or roll number" label="Search students" />
          <ul className="surface mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-ctl border border-line" role="radiogroup" aria-label="Students">
            {candidates.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted">No other students found.</li>
            )}
            {candidates.map((student) => (
              <li key={student.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-white/[0.07]">
                  <input
                    type="radio"
                    name="add-student"
                    checked={selected?.id === student.id}
                    onChange={() => setSelected(student)}
                  />
                  <span className="font-semibold text-ink">{student.name}</span>
                  <span className="ml-auto tabular-nums text-muted">{student.rollNumber}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
