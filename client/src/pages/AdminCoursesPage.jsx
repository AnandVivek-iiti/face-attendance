import { useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { Select, TextInput } from '../components/ui/Field';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import {
  createCourse,
  deleteCourse,
  getCourses,
  getProfessors,
  updateCourse,
  addProfessor,
  getDepartments,
  createDepartment,
  deleteDepartment,
  updateDepartment,
} from '../services/courseService';
import { getErrorMessage } from '../utils/errors';

const emptyCourse = { courseCode: '', courseName: '', professorId: '', semester: '', section: '', room: '' };

function CourseForm({ initial, professors, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <TextInput label="Course code" value={form.courseCode} onChange={set('courseCode')} placeholder="ME217" />
      <TextInput label="Course name" value={form.courseName} onChange={set('courseName')} placeholder="INDUSTRIAL DATA ANALYTICS" />
      <Select label="Professor" value={form.professorId} onChange={set('professorId')}>
        <option value="">Choose professor</option>
        {professors.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.email})
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-3 gap-3">
        <Select label="Semester" value={form.semester} onChange={set('semester')}>
          <option value="">—</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <TextInput label="Section" value={form.section} onChange={set('section')} placeholder="A" />
        <TextInput label="Room" value={form.room} onChange={set('room')} placeholder="L03" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={busy}>
          Save course
        </Button>
      </div>
    </div>
  );
}

export default function AdminCoursesPage() {
  const toast = useToast();
  const { data: courses = [], loading, error, reload } = useAsync(getCourses, [], {});
  const { data: departments = [] } = useAsync(getDepartments, [], {});
  const { data: professors = [], reload: reloadProfessors } = useAsync(getProfessors, [], {});

  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setDialog(null);
      await reload({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading admin data" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Admin — courses & people" description="Create courses, assign professors and rooms, manage departments." />

      <Card
        title="Courses"
        action={
          <Button size="sm" icon={Plus} onClick={() => setDialog({ type: 'course', id: null, initial: emptyCourse })}>
            New course
          </Button>
        }
      >
        {courses.length === 0 ? (
          <EmptyState title="No courses yet" description="Create your first course." />
        ) : (
          <ul className="divide-y divide-line">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {course.code} — {course.name}
                  </p>
                  <p className="text-sm text-muted">
                    Sem {course.semester} · Section {course.section} · Room {course.room || '—'} ·{' '}
                    {course.professorName || 'Unassigned'}
                  </p>
                </div>
                <Badge tone="neutral">{course.studentCount ?? 0} students</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Pencil}
                  onClick={() =>
                    setDialog({
                      type: 'course',
                      id: course.id,
                      initial: {
                        courseCode: course.code,
                        courseName: course.name,
                        professorId: course.professorId || '',
                        semester: course.semester == null ? '' : String(course.semester),
                        section: course.section || '',
                        room: course.room || '',
                      },
                    })
                  }
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => run(() => deleteCourse(course.id), 'Course removed.')} disabled={busy}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5" title="Professors">
        <ProfessorList onCreated={reloadProfessors} />
      </Card>

      <Card className="mt-5" title="Departments">
        <DepartmentList departments={departments} onChanged={() => {}} />
      </Card>

      <Modal
        open={dialog?.type === 'course'}
        title={dialog?.id ? 'Edit course' : 'New course'}
        onClose={() => setDialog(null)}
      >
        {dialog?.type === 'course' && (
          <CourseForm
            initial={dialog.initial}
            professors={professors}
            onCancel={() => setDialog(null)}
            onSave={async (form) => {
              const payload = {
                courseCode: form.courseCode.trim(),
                courseName: form.courseName.trim(),
                professorId: form.professorId,
                semester: Number(form.semester),
                section: form.section.trim(),
                room: form.room.trim() || null,
              };
              await run(
                () => (dialog.id ? updateCourse(dialog.id, payload) : createCourse(payload)),
                dialog.id ? 'Course updated.' : 'Course created.',
              );
            }}
          />
        )}
      </Modal>
    </>
  );
}

function ProfessorList({ onCreated }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  // The server returns a one-time password only in the create response.
  const [created, setCreated] = useState(null);

  const close = () => {
    setOpen(false);
    setCreated(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await addProfessor(form);
      toast.success(`${form.name} added.`);
      setCreated({ name: form.name, email: form.email, password: result?.temporaryPassword ?? '' });
      setForm({ name: '', email: '' });
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button size="sm" icon={UserPlus} onClick={() => setOpen(true)}>
        Add professor
      </Button>
      <Modal open={open} title={created ? 'Professor added' : 'Add professor'} onClose={close}>
        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              {created.name} ({created.email}) can now sign in with this temporary password.
            </p>
            <p className="select-all rounded-ctl border border-line px-3 py-2 font-mono text-sm text-ink">
              {created.password || 'Not returned by the server'}
            </p>
            <p className="text-xs text-muted">
              It is shown only once. Share it securely; the professor must change it at first sign-in.
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <TextInput label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextInput label="Email (@iiti.ac.in)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <p className="text-xs text-muted">
              A one-time password is generated and shown to you after the professor is added.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={submit} loading={busy}>Add professor</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DepartmentList({ departments, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createDepartment(form);
      toast.success(`${form.name} added.`);
      setOpen(false);
      setForm({ code: '', name: '' });
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3">
        <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
          Add department
        </Button>
      </div>
      {departments.length === 0 ? (
        <EmptyState title="No departments" />
      ) : (
        <ul className="divide-y divide-line">
          {departments.map((dept) => (
            <li key={dept.code} className="flex items-center gap-3 py-2.5">
              <Badge tone="neutral">{dept.code}</Badge>
              <span className="text-sm font-semibold text-ink">{dept.name}</span>
              <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto" onClick={async () => {
                try {
                  await deleteDepartment(dept.id);
                  toast.success('Department removed.');
                  onChanged();
                } catch (err) {
                  toast.error(getErrorMessage(err));
                }
              }} disabled={busy}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} title="Add department" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <TextInput label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="ME" />
          <TextInput label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Mechanical Engineering" />
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy}>Add department</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
