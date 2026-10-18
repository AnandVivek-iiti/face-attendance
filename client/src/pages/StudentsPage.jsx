import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Sparkles, Users } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { SearchInput, Select, TextInput } from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { createStudent, getStudents } from '../services/studentService';
import { ROLES, STUDENT_ID_PATTERN } from '../utils/constants';
import { getErrorMessage } from '../utils/errors';

const EMPTY_STUDENT = { name: '', rollNumber: '', department: '', semester: '', section: '' };

function NewStudentDialog({ open, onClose, onCreated }) {
  const toast = useToast();
  const [values, setValues] = useState(EMPTY_STUDENT);
  const [busy, setBusy] = useState(false);
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const idError = values.rollNumber.trim() && !STUDENT_ID_PATTERN.test(values.rollNumber.trim()) ? 'Use letters, numbers, dots, hyphens or underscores, up to 64 characters.' : undefined;
  const ready =
    values.name.trim() && values.rollNumber.trim() && values.department.trim() && values.semester && values.section.trim() && !idError;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      // The server keys students on studentId + rollNumber; the admin form uses the roll number for both.
      const rollNumber = values.rollNumber.trim();
      const student = await createStudent({
        studentId: rollNumber,
        rollNumber,
        name: values.name.trim(),
        department: values.department.trim(),
        semester: Number(values.semester),
        section: values.section.trim(),
      });
      toast.success('Student added.');
      setValues(EMPTY_STUDENT);
      onCreated(student);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Add student" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Full name" value={values.name} onChange={change('name')} required />
        <TextInput label="Roll number" value={values.rollNumber} onChange={change('rollNumber')} error={idError} required />
        <div className="grid grid-cols-3 gap-3">
          <TextInput label="Department" value={values.department} onChange={change('department')} placeholder="ME" required />
          <Select label="Semester" value={values.semester} onChange={change('semester')} required>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <TextInput label="Section" value={values.section} onChange={change('section')} placeholder="A" required />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            Add student
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const { data, loading, error, reload } = useAsync(getStudents);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data ?? []).filter(
      (student) =>
        !term || student.name.toLowerCase().includes(term) || String(student.rollNumber).toLowerCase().includes(term),
    );
  }, [data, query]);

  const header = (
    <PageHeader
      title="Students"
      description={isAdmin ? 'Add students and enroll their faces.' : 'Students in your courses. Open a student to set their real name and roll number.'}
      actions={
        isAdmin && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Add student
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <Spinner label="Loading students" />
      </>
    );
  }
  if (error) {
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      {header}
      <Card padded={false}>
        <div className="border-b border-line px-4 py-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name or roll number" label="Search students" />
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={data.length ? 'No students match your search' : 'No students yet'}
            description={data.length ? undefined : isAdmin ? 'Add a student to begin.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Students</caption>
              <thead>
                <tr className="surface border-b border-line text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2">Roll Number</th>
                  <th scope="col" className="px-4 py-2">Name</th>
                  <th scope="col" className="px-4 py-2">Department</th>
                  <th scope="col" className="px-4 py-2">Semester</th>
                  <th scope="col" className="px-4 py-2">Section</th>
                  <th scope="col" className="px-4 py-2">Face photographs</th>
                </tr>
              </thead>
              <tbody className="stagger">
                {rows.map((student) => (
                  <tr key={student.id} className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-white/[0.06]">
                    <td className="px-4 py-3 tabular-nums">
                      {student.rollNumber}
                      {student.autoEnrolled && (
                        <Badge tone="info" icon={Sparkles} className="ml-2">Auto ID</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <Link to={`/students/${student.id}`} className="text-primary hover:underline">
                        {student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{student.department}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{student.semester ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">
                      {student.section || '—'}
                      {student.active === false && (
                        <Badge tone="neutral" className="ml-2">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {student.faceImages?.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {student.faceImages.slice(0, 3).map((img) => (
                            <img
                              key={img.id}
                              src={img.url}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover border border-line"
                            />
                          ))}
                          {student.faceCount > 3 && (
                            <span className="text-xs text-muted">+{student.faceCount - 3}</span>
                          )}
                        </div>
                      ) : student.faceCount > 0 ? (
                        student.faceCount
                      ) : (
                        <Badge tone="warn" icon={AlertTriangle}>None, cannot be recognized</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <NewStudentDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          reload();
        }}
      />
    </>
  );
}
