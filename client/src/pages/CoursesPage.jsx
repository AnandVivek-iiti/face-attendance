import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Camera, Plus, Trash2, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Select, TextInput } from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { createCourse, deleteCourse, getCourses, getProfessors } from '../services/courseService';
import { getStudents } from '../services/studentService';
import { ROLES } from '../utils/constants';
import { getErrorMessage } from '../utils/errors';

// Students are not embedded in the course payload. The server defines the roster
// (and the "enrolled" count) as every ACTIVE student in the course's semester +
// section, so the dialog asks for exactly that.
function CourseStudentsDialog({ course, onClose }) {
  const { data, loading, error, reload } = useAsync(
    () => getStudents({ semester: course.semester, section: course.section, active: true }),
    [course.id],
  );
  const students = (data ?? []).filter(
    (student) =>
      student.active !== false &&
      String(student.semester) === String(course.semester) &&
      String(student.section).toUpperCase() === String(course.section).toUpperCase(),
  );
  return (
    <Modal open title={`${course.code} ${course.name}`} onClose={onClose} width="max-w-xl">
      {loading && <Spinner label="Loading students" />}
      {error && <ErrorState title="Could not load students" message={error} onRetry={reload} />}
      {data &&
        (students.length === 0 ? (
          <EmptyState
            title="No students enrolled"
            description={`Students belong to a course by semester and section (this course: Semester ${course.semester}, Section ${course.section}). A student with a different semester or section, or an inactive one, is not listed here but still appears under Students.`}
          />
        ) : (
          <ul className="surface max-h-80 divide-y divide-line overflow-y-auto rounded-ctl border border-line">
            {students.map((student) => (
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

const EMPTY_COURSE = { courseCode: '', courseName: '', professorId: '', semester: '', section: '', room: '' };

function NewCourseDialog({ open, onClose, onCreated }) {
  const toast = useToast();
  // Only admins can list professors, and only the open dialog needs them.
  const { data: professors = [] } = useAsync(getProfessors, [], { enabled: open });
  const [values, setValues] = useState(EMPTY_COURSE);
  const [busy, setBusy] = useState(false);

  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const ready = values.courseCode.trim() && values.courseName.trim() && values.professorId && values.semester;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createCourse({
        courseCode: values.courseCode.trim(),
        courseName: values.courseName.trim(),
        professorId: values.professorId,
        semester: Number(values.semester),
        section: values.section.trim(),
        room: values.room.trim() || null,
      });
      toast.success('Course created.');
      setValues(EMPTY_COURSE);
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
        <TextInput label="Course code" value={values.courseCode} onChange={change('courseCode')} placeholder="ME217" required />
        <TextInput label="Course name" value={values.courseName} onChange={change('courseName')} placeholder="INDUSTRIAL DATA ANALYTICS" required />
        <Select label="Professor" value={values.professorId} onChange={change('professorId')} required>
          <option value="">Choose professor</option>
          {professors.map((professor) => (
            <option key={professor.id} value={professor.id}>
              {professor.name} ({professor.email})
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-3 gap-3">
          <Select label="Semester" value={values.semester} onChange={change('semester')} required>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <TextInput label="Section" value={values.section} onChange={change('section')} placeholder="A" required />
          <TextInput label="Room" value={values.room} onChange={change('room')} placeholder="L03" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
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
                {isAdmin && (
                  <Button size="sm" icon={Trash2} onClick={() => setDeleting(course)}>
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {viewing && <CourseStudentsDialog course={viewing} onClose={() => setViewing(null)} />}
      {isAdmin && (
        <NewCourseDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </>
  );
}
