import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Cpu, Save, Trash2, Upload } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ErrorState from '../components/ui/ErrorState';
import { Select, TextInput } from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import Spinner from '../components/ui/Spinner';
import ImageUploader from '../components/ImageUploader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import {
  deleteStudent,
  generateStudentEmbedding,
  getStudent,
  updateStudent,
  uploadStudentFaces,
} from '../services/studentService';
import { ROLES, STUDENT_ID_PATTERN } from '../utils/constants';
import { getErrorMessage } from '../utils/errors';

export default function StudentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isAdmin = user.role === ROLES.ADMIN;
  // Professors can correct name / roll number for students in their own courses.
  const canEdit = isAdmin || user.role === ROLES.PROFESSOR;
  const { data: student, loading, error, reload } = useAsync(() => getStudent(id), [id]);

  const [values, setValues] = useState({ name: '', rollNumber: '', email: '', semester: '', section: '' });
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [embedding, setEmbedding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (student) {
      setValues({
        name: student.name,
        rollNumber: student.rollNumber,
        email: student.email,
        semester: student.semester == null ? '' : String(student.semester),
        section: student.section || '',
      });
    }
  }, [student]);

  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const idError = values.rollNumber.trim() && !STUDENT_ID_PATTERN.test(values.rollNumber.trim()) ? 'Use letters, numbers, dots, hyphens or underscores, up to 64 characters.' : undefined;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateStudent(id, {
        name: values.name.trim(),
        rollNumber: values.rollNumber.trim(),
        ...(isAdmin && { email: values.email.trim() }),
        // Semester + section decide which course a student belongs to (admin only).
        ...(isAdmin && values.semester && values.section.trim() && {
          semester: Number(values.semester),
          section: values.section.trim(),
        }),
      });
      toast.success('Student updated.');
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const upload = async () => {
    setUploading(true);
    setProgress(0);
    try {
      await uploadStudentFaces(id, files, setProgress);
      toast.success('Face photographs uploaded.');
      setFiles([]);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const generate = async () => {
    setEmbedding(true);
    try {
      await generateStudentEmbedding(id);
      toast.success('Face data generated.');
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEmbedding(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteStudent(id);
      toast.success('Student deleted.');
      navigate('/students', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading && !student) return <Spinner label="Loading student" />;
  if (error && !student) return <ErrorState message={error} onRetry={reload} title="Could not load this student" />;
  if (!student) return null;

  return (
    <>
      <Link to="/students" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Students
      </Link>
      <PageHeader
        title={student.name}
        description={`Roll number ${student.rollNumber}${student.semester != null ? ` · Semester ${student.semester}` : ''}${student.section ? ` · Section ${student.section}` : ''}${student.active === false ? ' · Inactive' : ''}`}
        actions={
          isAdmin && (
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete student
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Details">
          {student.autoEnrolled && (
            <p className="mb-4 rounded-ctl border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary" role="status">
              This student was enrolled automatically with a generated ID. Set their real name and roll number below.
            </p>
          )}
          <form onSubmit={save} className="space-y-4">
            <TextInput label="Full name" value={values.name} onChange={change('name')} disabled={!canEdit} required />
            <TextInput label="Roll number" value={values.rollNumber} onChange={change('rollNumber')} error={idError} disabled={!canEdit} required />
            <TextInput label="Email" type="email" value={values.email} onChange={change('email')} disabled={!isAdmin} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Semester" value={values.semester} onChange={change('semester')} disabled={!isAdmin}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <TextInput label="Section" value={values.section} onChange={change('section')} disabled={!isAdmin} />
            </div>
            {isAdmin && (
              <p className="text-xs text-muted">
                A student is on a course's roster when their semester and section match the course.
              </p>
            )}
            {canEdit && (
              <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!values.name.trim() || !values.rollNumber.trim() || Boolean(idError)}>
                Save changes
              </Button>
            )}
          </form>
        </Card>

        <Card title="Face enrollment">
          {student.faceImages.length > 0 ? (
            <ul className="mb-4 grid grid-cols-4 gap-2">
              {student.faceImages.map((image, index) => (
                <li key={image.id} className="skeleton aspect-square overflow-hidden rounded-ctl border border-line">
                  <img src={image.url} alt={`Enrolled face ${index + 1}`} className="h-full w-full object-cover" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">
              {student.faceCount > 0
                ? `${student.faceCount} face photographs are enrolled.`
                : 'No face photographs enrolled yet. Attendance cannot detect this student.'}
            </p>
          )}

          {isAdmin && (
            <div className="space-y-4">
              <ImageUploader
                files={files}
                onChange={setFiles}
                disabled={uploading}
                heading="Drag a clear face photograph here"
                noun="photo"
                maxFiles={1}
              />
              {uploading && <ProgressBar value={progress} label="Upload progress" />}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={Upload} loading={uploading} disabled={files.length === 0} onClick={upload}>
                  Upload photographs
                </Button>
                <Button icon={Cpu} loading={embedding} disabled={student.faceCount === 0 || uploading} onClick={generate}>
                  Generate face data
                </Button>
              </div>
              {student.hasEmbedding !== null && (
                <p className="text-sm text-muted">
                  {student.hasEmbedding ? 'Face data is ready.' : 'Face data has not been generated yet.'}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete student"
        confirmLabel="Delete student"
        tone="danger"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Delete <strong>{student.name}</strong>? Their face photographs and attendance records may also be removed.
        </p>
      </ConfirmDialog>
    </>
  );
}
