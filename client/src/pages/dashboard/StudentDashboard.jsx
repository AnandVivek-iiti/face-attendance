import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import ProgressBar from '../../components/ui/ProgressBar';
import Spinner from '../../components/ui/Spinner';
import { useAsync } from '../../hooks/useAsync';
import { getHistory } from '../../services/attendanceService';
import { summarizeHistory } from '../../utils/attendance';
import { formatDate, percent, ratio } from '../../utils/format';

export default function StudentDashboard({ user }) {
  const { data, loading, error, reload } = useAsync(getHistory);
  const header = <PageHeader title="My attendance" description={user.name} />;

  if (loading) {
    return (
      <>
        {header}
        <Spinner label="Loading your attendance" />
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

  const summary = summarizeHistory(data);
  if (summary.total === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No attendance recorded yet" description="Your attendance appears here after a class is finalized." />
        </Card>
      </>
    );
  }

  const overall = ratio(summary.present, summary.total);
  const recent = data
    .filter((item) => item.ownStatus)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Overall attendance" className="lg:col-span-1">
          <p className="font-serif text-5xl font-bold tabular-nums text-ink">{percent(overall)}</p>
          <p className="mt-1 text-sm text-muted">
            Present in {summary.present} of {summary.total} classes
          </p>
          <div className="mt-3">
            <ProgressBar value={overall} label="Overall attendance" />
          </div>
        </Card>

        <Card title="Course-wise attendance" className="lg:col-span-2">
          <ul className="stagger space-y-4">
            {summary.courses.map((entry) => {
              const value = ratio(entry.present, entry.total);
              return (
                <li key={entry.course.id ?? entry.course.code}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">
                      {entry.course.code} {entry.course.name}
                    </span>
                    <span className="tabular-nums text-muted">
                      {entry.present} of {entry.total}, {percent(value)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={value} label={`${entry.course.name} attendance`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card
        title="Recent attendance"
        className="mt-6"
        padded={false}
        action={
          <Link to="/attendance/history" className="text-sm font-semibold text-primary hover:underline">
            Full history
          </Link>
        }
      >
        <ul className="stagger divide-y divide-line">
          {recent.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {item.course.code} {item.course.name}
                </span>
                <span className="block text-xs text-muted">{formatDate(item.date)}</span>
              </span>
              {item.ownStatus === 'present' ? (
                <Badge tone="ok" icon={Check}>Present</Badge>
              ) : (
                <Badge tone="bad" icon={X}>Absent</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
