import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, History as HistoryIcon, Trash2, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Select } from '../components/ui/Field';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import SessionStatusBadge from '../components/SessionStatusBadge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { deleteSession, exportAllCsv, getHistory } from '../services/attendanceService';
import { getErrorMessage } from '../utils/errors';
import { ROLES } from '../utils/constants';
import { formatDate } from '../utils/format';

function courseLabel(course) {
  return [course.code, course.name].filter(Boolean).join(' ');
}

function Reviewed({ value }) {
  if (value === null || value === undefined) return <span className="text-muted">Not reported</span>;
  if (typeof value === 'boolean') {
    return value ? (
      <Badge tone="ok" icon={Check}>Yes</Badge>
    ) : (
      <Badge tone="warn" icon={X}>No</Badge>
    );
  }
  return <span className="tabular-nums">{value}</span>;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isStudent = user.role === ROLES.STUDENT;
  const { data, loading, error, reload } = useAsync(getHistory);
  const [course, setCourse] = useState('');
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const downloadAll = async () => {
    setExporting(true);
    try {
      const response = await exportAllCsv();
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers?.['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      link.download = match?.[1] || 'attendance-all.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const removeSession = async (item) => {
    const label = `${courseLabel(item.course)} on ${formatDate(item.date)}`;
    if (!window.confirm(`Delete attendance for ${label}? Its photos and records will be removed permanently.`)) return;
    setDeletingId(item.id);
    try {
      await deleteSession(item.id);
      toast.success('Attendance deleted.');
      await reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const courses = useMemo(() => {
    const map = new Map();
    (data ?? []).forEach((item) => map.set(String(item.course.id ?? courseLabel(item.course)), courseLabel(item.course)));
    return [...map.entries()];
  }, [data]);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((item) => !course || String(item.course.id ?? courseLabel(item.course)) === course)
        .filter((item) => !status || (isStudent ? item.ownStatus === status : item.status === status))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [data, course, status, isStudent],
  );

  const header = (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <PageHeader
        title="Attendance history"
        description={isStudent ? 'Your attendance in every class.' : 'Open a session to see or review its attendance.'}
      />
      {!isStudent && (
        <Button icon={Download} onClick={downloadAll} loading={exporting}>
          Export all (CSV)
        </Button>
      )}
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <Spinner label="Loading history" />
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
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <div className="w-56">
            <Select label="Course" value={course} onChange={(event) => setCourse(event.target.value)}>
              <option value="">All courses</option>
              {courses.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All</option>
              {isStudent ? (
                <>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                </>
              ) : (
                <>
                  <option value="finalized">Finalized</option>
                  <option value="draft">Draft</option>
                  <option value="review">Awaiting review</option>
                </>
              )}
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title={data.length ? 'No sessions match these filters' : 'No attendance recorded yet'}
            description={data.length ? 'Change the course or status filter.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Attendance sessions</caption>
              <thead>
                <tr className="surface border-b border-line text-xs font-semibold text-muted">
                  <th scope="col" className="px-4 py-2">Course</th>
                  <th scope="col" className="px-4 py-2">Date</th>
                  {isStudent ? (
                    <th scope="col" className="px-4 py-2">Status</th>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-2">Present</th>
                      <th scope="col" className="px-4 py-2">Absent</th>
                      <th scope="col" className="px-4 py-2">Reviewed</th>
                      <th scope="col" className="px-4 py-2">Status</th>
                      <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody key={`${course}|${status}`} className="stagger">
                {rows.map((item) => (
                  <tr key={item.id} className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-white/[0.06]">
                    <td className="px-4 py-3 font-semibold text-ink">
                      {isStudent ? (
                        courseLabel(item.course)
                      ) : (
                        <Link to={`/attendance/${item.id}/review`} className="text-primary hover:underline">
                          {courseLabel(item.course)}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(item.date)}</td>
                    {isStudent ? (
                      <td className="px-4 py-3">
                        {item.ownStatus === 'present' ? (
                          <Badge tone="ok" icon={Check}>Present</Badge>
                        ) : (
                          <Badge tone="bad" icon={X}>Absent</Badge>
                        )}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 tabular-nums">{item.present ?? ''}</td>
                        <td className="px-4 py-3 tabular-nums">{item.absent ?? ''}</td>
                        <td className="px-4 py-3"><Reviewed value={item.reviewed} /></td>
                        <td className="px-4 py-3"><SessionStatusBadge status={item.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="danger"
                            icon={Trash2}
                            loading={deletingId === item.id}
                            onClick={() => removeSession(item)}
                            aria-label={`Delete attendance for ${courseLabel(item.course)} on ${formatDate(item.date)}`}
                          >
                            Delete
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
