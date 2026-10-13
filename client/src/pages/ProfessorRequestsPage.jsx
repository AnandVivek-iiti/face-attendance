import { useState } from 'react';
import { Check, X } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { approveRequest, getPendingRequests, rejectRequest } from '../services/enrollmentService';
import { assetUrl } from '../utils/normalize';
import { formatDate } from '../utils/format';

function RequestCard({ request, onDecide }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const imageUrl = assetUrl(request.imagePath);

  const act = async (action) => {
    setBusy(true);
    try {
      await onDecide(action, request, note.trim() || undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={`Face of ${request.name}`}
            className="h-24 w-24 rounded-ctl border border-line object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{request.name}</p>
          <p className="mt-0.5 text-sm text-muted">
            Roll <span className="font-semibold text-ink">{request.rollNumber}</span> · Year {request.year} · Sem{' '}
            {request.semester} · {request.department}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {request.course?.courseCode} — {request.course?.courseName}
          </p>
          <p className="mt-1 text-xs text-muted">Requested {formatDate(request.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={() => act('approve')}>
            Approve
          </Button>
          <Button size="sm" variant="danger" icon={X} loading={busy} onClick={() => act('reject')}>
            Reject
          </Button>
        </div>
      </div>
      {note !== undefined && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (shown in audit)"
          className="control mt-3 w-full"
        />
      )}
    </Card>
  );
}

export default function ProfessorRequestsPage() {
  const toast = useToast();
  const { data: requests = [], loading, error, reload } = useAsync(getPendingRequests, [], {});

  const decide = async (action, request, note) => {
    try {
      if (action === 'approve') await approveRequest(request.id, note);
      else await rejectRequest(request.id, note);
      toast.success(action === 'approve' ? `${request.name} approved.` : `${request.name} rejected.`);
      await reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <Spinner label="Loading requests" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Enrollment requests"
        description="Approve students to add them to your course roster, or reject them."
      />
      {requests.length === 0 ? (
        <Card>
          <EmptyState title="No pending requests" description="New student requests will appear here." />
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} onDecide={decide} />
          ))}
        </div>
      )}
    </>
  );
}
