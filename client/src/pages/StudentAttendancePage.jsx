import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import Spinner from '../components/ui/Spinner';
import { useAsync } from '../hooks/useAsync';
import { getAttendance } from '../services/studentProfileService';
import { formatDate } from '../utils/format';

function StatCard({ label, value, tone = 'default' }) {
  return (
    <Card className="text-center">
      <p className={`font-serif text-3xl font-bold ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Card>
  );
}

export default function StudentAttendancePage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(getAttendance, [], {});

  const overall = useMemo(() => data?.summary, [data]);

  if (loading) return <Spinner label="Loading your attendance" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="My attendance" description="Your attendance across enrolled courses." />

      {!data.rollNumber ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No profile yet"
            description="Set up your profile to see your attendance."
            action={
              <Button variant="primary" onClick={() => navigate('/student/profile')}>
                Set up profile
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Classes held" value={overall?.total ?? 0} />
            <StatCard label="Present" value={overall?.present ?? 0} tone="ok" />
            <StatCard label="Absent" value={overall?.absent ?? 0} tone="bad" />
          </div>

          {overall?.percentage != null && (
            <Card className="mt-4">
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-semibold text-ink">Overall attendance</span>
                <span className="tabular-nums text-muted">{overall.percentage}%</span>
              </div>
              <ProgressBar value={overall.percentage / 100} label="Overall attendance" />
            </Card>
          )}

          <div className="mt-5 space-y-4">
            {(data.courses ?? []).map((course) => (
              <Card key={course.courseId} title={`${course.courseCode} — ${course.courseName}`}>
                <div className="mb-3 flex items-center gap-4 text-sm text-muted">
                  <span className="tabular-nums">{course.total} sessions</span>
                  <span className="flex items-center gap-1 text-ok">
                    <CheckCircle2 size={14} /> {course.present}
                  </span>
                  <span className="flex items-center gap-1 text-bad">
                    <XCircle size={14} /> {course.absent}
                  </span>
                  <Badge tone={course.percentage >= 75 ? 'ok' : 'warn'}>{course.percentage}%</Badge>
                </div>
                {course.sessions.length > 0 ? (
                  <ul className="divide-y divide-line text-sm">
                    {course.sessions.map((session) => (
                      <li key={String(session.sessionId)} className="flex items-center justify-between py-2">
                        <span className="text-muted">{formatDate(session.date)}</span>
                        {session.status === 'present' ? (
                          <Badge tone="ok" icon={CheckCircle2}>Present</Badge>
                        ) : (
                          <Badge tone="bad" icon={XCircle}>Absent</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No sessions recorded yet.</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
