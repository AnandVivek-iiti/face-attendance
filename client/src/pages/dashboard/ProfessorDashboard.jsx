import { Link } from 'react-router-dom';
import { BookOpen, Camera, CalendarCheck, ClipboardList, History } from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import StatCard from '../../components/ui/StatCard';
import SessionList from '../../components/SessionList';
import { useAsync } from '../../hooks/useAsync';
import { getHistory } from '../../services/attendanceService';
import { getCourses } from '../../services/courseService';
import { formatDate, percent, ratio, todayIso } from '../../utils/format';

export default function ProfessorDashboard({ user }) {
  const courses = useAsync(getCourses);
  const history = useAsync(getHistory);

  const loading = courses.loading || history.loading;
  const error = courses.error || history.error;
  const reload = () => {
    courses.reload();
    history.reload();
  };

  const takeAttendance = (
    <Button as={Link} to="/attendance/new" variant="primary" size="lg" icon={Camera}>
      Take Attendance
    </Button>
  );

  const header = (
    <PageHeader
      title={user.name ? `Welcome, ${user.name}` : 'Dashboard'}
      description="Today's sessions and attendance that still needs your review."
      actions={takeAttendance}
    />
  );

  if (loading && !courses.data && !history.data) {
    return (
      <>
        {header}
        <Spinner label="Loading dashboard" variant="dashboard" />
      </>
    );
  }

  if (error && (!courses.data || !history.data)) {
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={reload} />
      </>
    );
  }

  const sessions = [...(history.data ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const today = sessions.filter((session) => session.date === todayIso());
  const pending = sessions.filter((session) => session.status !== 'finalized');
  const recent = sessions.slice(0, 5);
  const latest = sessions.find((session) => session.status === 'finalized' && session.total);

  return (
    <>
      {header}

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookOpen} label="Total Courses" value={(courses.data ?? 0).length} />
        <StatCard icon={CalendarCheck} label="Today's Sessions" value={today.length} />
        <StatCard icon={ClipboardList} label="Pending Reviews" value={pending.length} hint="Sessions not yet finalized" />
        <StatCard
          icon={History}
          label="Recent Attendance"
          value={latest ? percent(ratio(latest.present ?? 0, latest.total)) : 'None'}
          hint={latest ? `${latest.course.code}, ${formatDate(latest.date)}` : 'No finalized sessions yet'}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Today's attendance sessions" padded={false}>
          <SessionList
            sessions={today}
            emptyTitle="No sessions today"
            emptyDescription="Upload a classroom photograph to start today's attendance."
            emptyAction={
              <Button as={Link} to="/attendance/new" icon={Camera}>
                Take Attendance
              </Button>
            }
          />
        </Card>

        <Card
          title="Pending reviews"
          padded={false}
          action={
            <Link to="/attendance/history" className="text-sm font-semibold text-primary hover:underline">
              All history
            </Link>
          }
        >
          <SessionList
            sessions={pending.slice(0, 5)}
            emptyTitle="Nothing waiting for review"
            emptyDescription="Sessions you have not finalized appear here."
          />
        </Card>

        <Card
          title="Recent attendance"
          padded={false}
          action={
            <Link to="/attendance/history" className="text-sm font-semibold text-primary hover:underline">
              View history
            </Link>
          }
        >
          <SessionList sessions={recent} emptyTitle="No attendance recorded yet" />
        </Card>

        <Card
          title="Courses"
          padded={false}
          action={
            <Link to="/courses" className="text-sm font-semibold text-primary hover:underline">
              Manage courses
            </Link>
          }
        >
          {courses.data.length === 0 ? (
            <EmptyState title="No courses yet" description="Courses assigned to you appear here." />
          ) : (
            <ul className="stagger divide-y divide-line">
              {courses.data.slice(0, 6).map((course) => (
                <li key={course.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {course.code} {course.name}
                    </span>
                    <span className="block text-xs text-muted">{course.studentCount} enrolled</span>
                  </span>
                  <Button as={Link} to={`/attendance/new?course=${course.id}`} size="sm" icon={Camera}>
                    Take attendance
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
