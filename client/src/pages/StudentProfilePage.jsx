import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, GraduationCap, Pencil } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import { Select, TextInput } from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { getAvailableCourses, getDepartments } from '../services/courseService';
import { buildProfile, getProfile } from '../services/studentProfileService';

const STEPS = [
  { key: 'year', label: 'Year', icon: GraduationCap },
  { key: 'semester', label: 'Semester', icon: BookOpen },
  { key: 'department', label: 'Department', icon: GraduationCap },
  { key: 'course', label: 'Course', icon: BookOpen },
];

const YEARS = [1, 2, 3, 4, 5, 6];

function Stepper({ current, maxReached }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Profile setup steps">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                done
                  ? 'border-ok-line bg-ok-soft text-ok'
                  : active
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line text-muted opacity-50'
              }`}
            >
              {done ? <CheckCircle2 size={13} /> : <Icon size={13} />}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function StudentProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const savedDetails = user?.profileComplete === true;
  const [editing, setEditing] = useState(false);
  const showWizard = !savedDetails || editing;
  const saved = useAsync(getProfile, [], { enabled: savedDetails && !editing });
  const healed = useRef(false);

  // Self-heal sessions stored before profile state was tracked: if the server already has saved details, pick them up instead of showing the...
  useEffect(() => {
    if (savedDetails || healed.current) return;
    healed.current = true;
    getProfile()
      .then((data) => {
        if (data?.profileComplete) refreshUser().catch(() => {});
      })
      .catch(() => {});
  }, [savedDetails, refreshUser]);

  const startEditing = () => {
    const kept = saved.data?.profile ?? {};
    setValues({
      year: kept.year ?? '',
      semester: kept.semester ?? '',
      department: kept.department ?? '',
      courseId: '',
    });
    setRollNumber(kept.rollNumber ?? '');
    setName(user?.name ?? '');
    setImage(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStep(3);
    setMaxReached(3);
    setResult(null);
    setError(null);
    setEditing(true);
  };

  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [values, setValues] = useState({ year: '', semester: '', department: '', courseId: '' });
  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const { data: coursesData, error: coursesError, reload: reloadCourses } = useAsync(getAvailableCourses, [], {});
  const { data: departmentsData } = useAsync(getDepartments, [], {});
  const courses = coursesData ?? [];
  const departments = departmentsData ?? [];

  const { coursesForSelection, coursesRelaxed } = useMemo(() => {
    const filtered = courses.filter(
      (course) =>
        (!values.semester || course.semester == null || String(course.semester) === String(values.semester)) &&
        // Courses saved before departments existed have none set — they match every department so the list never comes back empty for them.
        (!values.department || !course.department || course.department === values.department)
    );
    // Never dead-end the student on this step: if the filter empties the list, fall back to every course so ME217 is always pickable.
    if (filtered.length > 0 || courses.length === 0) return { coursesForSelection: filtered, coursesRelaxed: false };
    return { coursesForSelection: courses, coursesRelaxed: true };
  }, [courses, values.semester, values.department]);

  // Default to ME217 (the test course) when it is among the options, or to the only option when there is just one.
  useEffect(() => {
    if (values.courseId || coursesForSelection.length === 0) return;
    const preferred =
      coursesForSelection.find((course) => String(course.code).toUpperCase() === 'ME217') ??
      (coursesForSelection.length === 1 ? coursesForSelection[0] : null);
    if (preferred) setValues((current) => (current.courseId ? current : { ...current, courseId: preferred.id }));
  }, [coursesForSelection, values.courseId]);

  const canContinue = () => {
    if (step === 0) return Boolean(values.year);
    if (step === 1) return Boolean(values.semester);
    if (step === 2) return Boolean(values.department);
    if (step === 3) return Boolean(values.courseId);
    return false;
  };

  const next = () => {
    if (!canContinue()) return;
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    setStep(nextStep);
    setMaxReached((max) => Math.max(max, nextStep));
    setResult(null);
  };

  const back = () => {
    setStep((value) => Math.max(value - 1, 0));
    setResult(null);
  };

  const onPickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
  };

  // Every card is mandatory: year, semester, department, course, plus roll number, name and a face photo.
  const missingDetails = () => {
    const missing = [];
    if (!values.year) missing.push('year');
    if (!values.semester) missing.push('semester');
    if (!values.department) missing.push('department');
    if (!values.courseId) missing.push('course');
    if (!rollNumber.trim()) missing.push('roll number');
    if (!name.trim()) missing.push('full name');
    if (!image) missing.push('face photo');
    return missing;
  };

  const canSubmit = () => missingDetails().length === 0;

  const submit = async () => {
    const missing = missingDetails();
    if (missing.length) {
      const message = `Fill in every step before submitting: ${missing.join(', ')}.`;
      setError(message);
      toast.error(message);
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await buildProfile(
        {
          rollNumber: rollNumber.trim(),
          name: name.trim(),
          year: Number(values.year),
          semester: Number(values.semester),
          department: values.department,
          courseId: values.courseId,
        },
        image
      );
      setResult(response);
      // Refresh the stored user so the setup gate opens immediately — no re-login needed — then later logins land on the dashboard normally.
      try {
        await refreshUser();
      } catch {
        // Gate re-checks on next navigation; the save itself succeeded.
      }
      setEditing(false);
      toast.success(
        response.enrolled
          ? 'Profile saved — you are enrolled.'
          : 'Profile saved — request sent to your professor for approval.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Saved once: later logins land here-ready and every other page is open.
  if (!showWizard) {
    const detail = saved.data;
    if (saved.loading && !detail) return <Spinner label="Loading your profile" />;
    if (saved.error && !detail) {
      return (
        <>
          <PageHeader title="My profile" description="Your saved attendance details." />
          <ErrorState message={saved.error} onRetry={saved.reload} />
        </>
      );
    }
    const profile = detail?.profile ?? {};
    const enrolled = detail?.linkedStudent ?? null;
    const pending = detail?.pendingRequests ?? [];
    return (
      <>
        <PageHeader title="My profile" description="Your saved attendance details." />
        <Card scan="once" className="max-w-2xl">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ['Roll number', profile.rollNumber],
              ['Full name', user?.name],
              ['Year', profile.year],
              ['Semester', profile.semester],
              ['Department', profile.department],
            ].map(([label, value]) => (
              <div key={label} className="rounded-ctl border border-line px-3 py-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-ctl border border-ok-line bg-ok-soft px-4 py-3 text-sm text-ok" role="status">
            {enrolled
              ? `Enrolled${enrolled.rollNumber ? ` as ${enrolled.rollNumber}` : ''}. Your attendance is being recorded.`
              : pending.length
                ? 'Your request is pending professor approval. You will see attendance once approved.'
                : 'Profile saved.'}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button as={Link} to="/student/attendance" variant="primary">
              View my attendance
            </Button>
            <Button icon={Pencil} onClick={startEditing}>
              Update details
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={editing ? 'Update profile' : 'Complete your profile'}
        description={
          editing
            ? 'Change any step, then save again.'
            : 'Fill in every step — all details are required and other pages stay locked until you save.'
        }
      />
      {savedDetails && editing && (
        <p className="mb-4">
          <Button onClick={() => setEditing(false)}>Back to saved profile</Button>
        </p>
      )}
      <Card scan="once" className="max-w-2xl">
        <Stepper current={step} maxReached={maxReached} />
        <div className="mt-6 space-y-5">
          {step === 0 && (
            <div>
              <span className="mb-2 block text-sm font-semibold text-ink">Select your year</span>
              <div className="flex flex-wrap gap-2">
                {YEARS.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, year }))}
                    className={`rounded-ctl border px-4 py-2 text-sm font-semibold transition ${
                      String(values.year) === String(year)
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-ink hover:border-white/25'
                    }`}
                  >
                    Year {year}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <Select
              label="Select your semester"
              value={values.semester}
              onChange={(event) => setValues((v) => ({ ...v, semester: event.target.value }))}
            >
              <option value="">Choose semester</option>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </Select>
          )}

          {step === 2 && (
            <Select
              label="Select your department"
              value={values.department}
              onChange={(event) => setValues((v) => ({ ...v, department: event.target.value }))}
            >
              <option value="">Choose department</option>
              {departments.map((dept) => (
                <option key={dept.code} value={dept.code}>
                  {dept.name}
                </option>
              ))}
            </Select>
          )}

          {step === 3 && (
            <>
              <Select
                label="Select your course"
                value={values.courseId}
                onChange={(event) => setValues((v) => ({ ...v, courseId: event.target.value }))}
              >
                <option value="">Choose course</option>
                {coursesForSelection.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.name}
                  </option>
                ))}
              </Select>
              {values.courseId && courses.some((c) => c.id === values.courseId) && (
                <p className="mt-2 text-sm text-muted" role="status">
                  Pattern: {courses.find((c) => c.id === values.courseId)?.rollNumberPattern || ''}
                </p>
              )}
              {courses.length === 0 && (
                <p className="mt-2 text-sm text-warn" role="status">
                  {coursesError || 'No courses found — ask your professor to create one, then retry.'}{' '}
                  {coursesError && (
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={reloadCourses}>
                      Retry
                    </button>
                  )}
                </p>
              )}
              {courses.length > 0 && coursesRelaxed && (
                <p className="mt-2 text-sm text-muted" role="status">
                  No exact match for this semester and department — showing all courses.
                </p>
              )}
            </>
          )}

          {maxReached >= 3 && (
            <div className="border-t border-line pt-5 space-y-4">
              <TextInput
                label="Roll number (attendance ID)"
                value={rollNumber}
                onChange={(event) => setRollNumber(event.target.value)}
                placeholder="e.g. ME217001"
              />
              <TextInput
                label="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
              />
              <div>
                <span className="mb-2 block text-sm font-semibold text-ink">Upload your photo</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onPickImage}
                  className="block w-full text-sm text-muted file:mr-4 file:rounded-ctl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-ink hover:file:bg-primary-dark"
                />
                {preview && (
                  <img
                    src={preview}
                    alt="Preview"
                    className="mt-3 h-32 w-32 rounded-ctl border border-line object-cover"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-ctl border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        {result && (
          <div
            className={`mt-4 rounded-ctl border px-4 py-3 text-sm ${
              result.enrolled
                ? 'border-ok-line bg-ok-soft text-ok'
                : 'border-warn-line bg-warn-soft text-warn'
            }`}
            role="status"
          >
            {result.enrolled
              ? `Enrolled in ${result.course?.courseCode}. Your attendance is ready.`
              : 'Your request is pending professor approval. You will see attendance once approved.'}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          {step > 0 && (
            <Button onClick={back} disabled={submitting}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button variant="primary" onClick={next} disabled={!canContinue()}>
              Continue
            </Button>
          )}
          {maxReached >= 3 && (
            <Button variant="primary" onClick={submit} loading={submitting} disabled={!canSubmit()}>
              {result?.enrolled ? 'Resubmit' : 'Submit'}
            </Button>
          )}
          {maxReached >= 3 && !canSubmit() && (
            <p className="w-full text-sm text-muted" role="status">
              Still needed: {missingDetails().join(', ')}.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
