import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Camera, Plus, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { TextInput } from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { createCourse, getCourse, getCourses } from '../services/courseService';
import { ROLES } from '../utils/constants';
import { getErrorMessage } from '../utils/errors';

function CourseStudentsDialog({ course, onClose }) {
  const { data, loading, error, reload } = useAsync(() => getCourse(course.id), [course.id]);
  return (
    <Modal open title={`${course.code} ${course.name}`} onClose={onClose} width="max-w-xl">
      {loading && <Spinner label="Loading students" />}
      {error && <ErrorState title="Could not load this course" message={error} onRetry={reload} />}
      {data &&
        (data.students.length === 0 ? (
          <EmptyState title="No students enrolled" />
        ) : (
          <ul className="surface max-h-80 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
            {data.students.map((student) => (
              <li key={student.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{student.name}</span>
                <span className="tabular-nums text-muted">{student.rollNumber}</span>
              </li>
            ))}
          </ul>
        ))}
    </Modal>
  );
}

function NewCourseDialog({ open, onClose, onCreated }) {
  const toast = useToast();
  const [values, setValues] = useState({ code: '', name: '', department: '' });
  const [busy, setBusy] = useState(false);

  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createCourse({
        code: values.code.trim(),
        name: values.name.trim(),
        ...(values.department.trim() && { department: values.department.trim() }),
      });
      toast.success('Course created.');
      setValues({ code: '', name: '', department: '' });
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="New course" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Course code" value={values.code} onChange={change('code')} required />
        <TextInput label="Course name" value={values.name} onChange={change('name')} required />
        <TextInput label="Department" value={values.department} onChange={change('department')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!values.code.trim() || !values.name.trim()}>
            Create course
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CoursesPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(getCourses);
  const [viewing, setViewing] = useState(null);
  const [creating, setCreating] = useState(false);
  const isAdmin = user.role === ROLES.ADMIN;
  const isProfessor = user.role === ROLES.PROFESSOR;

  const header = (
    <PageHeader
      title="Courses"
      description={isAdmin ? 'All courses in the system.' : 'Courses you teach.'}
      actions={
        isAdmin && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New course
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <Spinner label="Loading courses" />
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
      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description={isAdmin ? 'Create the first course to begin.' : 'Courses assigned to you appear here.'}
          />
        </Card>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((course) => (
            <Card key={course.id}>
              <p className="text-sm font-semibold text-primary">{course.code}</p>
              <h2 className="font-serif text-lg font-semibold text-ink">{course.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Users size={14} aria-hidden="true" />
                {course.studentCount} enrolled
              </p>
              {course.professorName && <p className="text-sm text-muted">{course.professorName}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {isProfessor && (
                  <Button as={Link} to={`/attendance/new?course=${course.id}`} variant="primary" size="sm" icon={Camera}>
                    Take attendance
                  </Button>
                )}
                <Button size="sm" icon={Users} onClick={() => setViewing(course)}>
                  View students
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {viewing && <CourseStudentsDialog course={viewing} onClose={() => setViewing(null)} />}
      <NewCourseDialog
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
