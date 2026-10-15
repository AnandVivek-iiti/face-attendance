import { Link } from 'react-router-dom';
import EmptyState from './ui/EmptyState';
import SessionStatusBadge from './SessionStatusBadge';
import { formatDate } from '../utils/format';

export default function SessionList({ sessions = [], emptyTitle, emptyDescription, emptyAction }) {
  if (!sessions.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return (
    <ul className="stagger divide-y divide-line">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            to={`/attendance/${session.id}/review`}
            className="ripple flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.06]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">
                {session.course.code} {session.course.name}
              </span>
              <span className="block text-xs text-muted">
                {formatDate(session.date)}
                {session.present !== null && `, ${session.present} present, ${session.absent ?? 0} absent`}
              </span>
            </span>
            <SessionStatusBadge status={session.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}