import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Select, TextInput } from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import ImageUploader from '../components/ImageUploader';
import QualityAlert from '../components/QualityAlert';
import UploadProgress from '../components/UploadProgress';
import { useAsync } from '../hooks/useAsync';
import { useAttendanceUpload } from '../hooks/useAttendanceUpload';
import { getCourses } from '../services/courseService';
import { isSessionUnusable, qualityAlerts } from '../utils/attendance';
import { todayIso } from '../utils/format';

export default function NewAttendancePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const courses = useAsync(getCourses);
  const upload = useAttendanceUpload();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [date, setDate] = useState(params.get('date') || todayIso());
  const [files, setFiles] = useState([]);
  const [rejected, setRejected] = useState(null);

  useEffect(() => {
    if (courses.data?.length === 1 && !courseId) setCourseId(String(courses.data[0].id));
  }, [courses.data, courseId]);

  const handleResult = (session) => {
    if (!session) return;
    if (isSessionUnusable(session)) {
      setRejected(session);
      return;
    }
    navigate(`/attendance/${session.id}/review`);
  };

  const submit = async (event) => {
    event.preventDefault();
    setRejected(null);
    handleResult(await upload.run({ courseId, date, files }));
  };

  const startOver = () => {
    upload.reset();
    setRejected(null);
    setFiles([]);
  };

  const showProgress = upload.busy || upload.stage === 'error';
  const canSubmit = courseId && date && files.length > 0 && !upload.busy;

  if (courses.loading) {
    return (
      <>
        <PageHeader title="Take attendance" />
        <Spinner label="Loading courses" />
      </>
    );
  }

  if (courses.error) {
    return (
      <>
        <PageHeader title="Take attendance" />
        <ErrorState message={courses.error} onRetry={courses.reload} title="Could not load your courses" />
      </>
    );
  }

  if (!courses.data.length) {
    return (
      <>
        <PageHeader title="Take attendance" />
        <Card>
          <EmptyState title="No courses available" description="You need a course before you can take attendance." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Take attendance"
        description="Choose the class, then upload one or more photographs of the room."
      />

      <form onSubmit={submit} className="max-w-4xl space-y-5">
        <Card scan="once">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={upload.busy || Boolean(upload.session)}
              required
            >
              <option value="">Select a course</option>
              {courses.data.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} {course.name}
                </option>
              ))}
            </Select>
            <TextInput
              label="Date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={upload.busy || Boolean(upload.session)}
              required
            />
          </div>
        </Card>

        <Card title="Classroom photographs">
          <ImageUploader files={files} onChange={setFiles} disabled={upload.busy || Boolean(rejected)} />
          <p className="mt-3 text-xs text-muted">
            With several photographs, each student is counted once. Not everyone has to appear in every photograph.
          </p>
        </Card>

        {showProgress && (
          <UploadProgress
            stage={upload.stage}
            failedStage={upload.failedStage}
            uploadProgress={upload.uploadProgress}
            error={upload.error}
            onRetry={async () => handleResult(await upload.retry())}
            onCancel={startOver}
          />
        )}

        {rejected && (
          <div className="space-y-3">
            {qualityAlerts(rejected).map((item) => (
              <QualityAlert
                key={item.index ?? 'session'}
                quality={item.quality}
                photoLabel={item.index !== null && rejected.images.length > 1 ? `Photo ${item.index + 1}` : undefined}
                onUploadNew={startOver}
              />
            ))}
            <Link
              to={`/attendance/${rejected.id}/review`}
              className="inline-block text-sm font-semibold text-primary hover:underline"
            >
              Open the session and mark attendance manually
            </Link>
          </div>
        )}

        {!showProgress && !rejected && (
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="lg" icon={Upload} disabled={!canSubmit}>
              Upload and analyze
            </Button>
            {files.length > 0 && (
              <span className="text-sm text-muted">
                {files.length} {files.length === 1 ? 'photograph' : 'photographs'} selected
              </span>
            )}
          </div>
        )}
      </form>
    </>
  );
}
