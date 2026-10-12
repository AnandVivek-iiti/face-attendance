import ConfirmDialog from './ui/ConfirmDialog';

export default function FinalizeDialog({ open, summary, courseName, busy, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title="Finalize attendance"
      confirmLabel="Finalize Attendance"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        You are about to finalize attendance for <strong>{courseName}</strong>. {summary.present} present and {summary.absent} absent.
      </p>
      {summary.pendingReview > 0 && (
        <p className="mt-2 rounded-ctl border border-warn-line bg-warn-soft px-3 py-2 text-warn">
          {summary.pendingReview} {summary.pendingReview === 1 ? 'face still needs' : 'faces still need'} review. They will be recorded with the current status.
        </p>
      )}
      <p className="mt-2 text-muted">Finalized attendance is read-only and cannot be edited from this screen.</p>
    </ConfirmDialog>
  );
}
