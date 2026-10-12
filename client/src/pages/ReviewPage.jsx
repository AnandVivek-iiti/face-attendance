import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCheck, Loader2, Lock, RefreshCw, Save, Undo2 } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import Spinner from '../components/ui/Spinner';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import AddStudentDialog from '../components/AddStudentDialog';
import ChangeStudentDialog from '../components/ChangeStudentDialog';
import FinalizeDialog from '../components/FinalizeDialog';
import ImageViewer from '../components/ImageViewer';
import QualityAlert from '../components/QualityAlert';
import ReviewPanel from '../components/ReviewPanel';
import SessionStatusBadge from '../components/SessionStatusBadge';
import SessionSummary from '../components/SessionSummary';
import { useToast } from '../context/ToastContext';
import { useImageSizes } from '../hooks/useImageSizes';
import { useReviewState } from '../hooks/useReviewState';
import { useSession } from '../hooks/useSession';
import { analyzeSession, finalizeSession, updateRecord } from '../services/attendanceService';
import { buildReview, overridePayload, qualityAlerts } from '../utils/attendance';
import { getErrorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

export default function ReviewPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { session, loading, error, reload, polling } = useSession(sessionId);
  const review = useReviewState();
  const sizes = useImageSizes(session?.images ?? []);

  const [manualMode, setManualMode] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedFaceKey, setSelectedFaceKey] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const built = useMemo(() => (session ? buildReview(session, review.state) : null), [session, review.state]);

  useEffect(() => {
    if (review.dirtyCount === 0) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [review.dirtyCount]);

  if (loading && !session) return <Spinner label="Loading attendance session" />;
  if (error && !session) return <ErrorState message={error} onRetry={() => reload()} title="Could not load this session" />;
  if (!session || !built) return null;

  const readOnly = session.status === 'finalized';
  const imageById = Object.fromEntries(session.images.map((image) => [image.id, image]));
  const selectedFace = built.faces.find((face) => face.key === selectedFaceKey) ?? null;
  const alerts = qualityAlerts(session);
  const hasAnalysis = session.images.some((image) => image.analyzed);
  const courseTitle = [session.course.code, session.course.name].filter(Boolean).join(' ') || 'Attendance session';
  const uploadNewHref = `/attendance/new?course=${session.course.id ?? ''}&date=${session.date}`;

  const flush = async () => {
    const entries = Object.entries(review.state.overrides);
    const results = await Promise.allSettled(
      entries.map(([studentId, override]) => updateRecord(sessionId, studentId, overridePayload(override))),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) {
      const detail = getErrorMessage(failed[0].reason);
      throw new Error(`${failed.length} of ${entries.length} changes were not saved. ${detail}`);
    }
    if (entries.length) {
      await reload({ silent: true });
      review.reset();
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await flush();
      toast.success('Draft saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      await flush();
      await finalizeSession(sessionId);
      await reload({ silent: true });
      setDialog(null);
      toast.success('Attendance finalized.');
    } catch (err) {
      toast.error(err.message || getErrorMessage(err));
    } finally {
      setFinalizing(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      await analyzeSession(sessionId);
      await reload({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const focusFace = (face) => {
    if (!face) return;
    setSelectedFaceKey(face.key);
    setActiveIndex(face.imageIndex);
  };

  const handlers = {
    onPresent: (row) => review.setStatus([row.studentId], 'present', Boolean(row.face)),
    onAbsent: (row) => review.setStatus([row.studentId], 'absent', Boolean(row.face)),
    onBulk: (ids, status) => review.setManual(ids, status),
    onChange: (row) => setDialog({ type: 'change', face: row.face, fromRow: row }),
    onIgnore: (row) => review.ignore(row.studentId),
    onFocus: (row) => focusFace(row.face),
    onSelectFace: (key) => {
      const face = built.faces.find((item) => item.key === key);
      focusFace(face);
      if (face?.owner) {
        document.getElementById(`row-${face.owner}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    onAssignFace: (face) => {
      focusFace(face);
      setDialog({ type: 'change', face, fromRow: null });
    },
    onDismissFace: (face) => review.dismissFace(face.key),
  };

  const confirmChange = (toId) => {
    review.reassign(dialog.fromRow?.studentId ?? null, toId, dialog.face);
    setDialog(null);
  };

  const confirmAdd = (student) => {
    review.addStudent({
      studentId: student.studentId,
      rollNumber: student.rollNumber,
      name: student.name,
      status: 'absent',
      source: 'manual',
      faceKey: null,
      ignored: false,
    });
    setDialog(null);
  };

  const header = (
    <div className="mb-5">
      <Link to="/attendance/history" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Attendance history
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">{courseTitle}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            {formatDate(session.date)}
            <SessionStatusBadge status={session.status} />
          </p>
        </div>
        {!readOnly && hasAnalysis && !polling && (
          <div className="flex flex-wrap items-center gap-3">
            <ToggleSwitch checked={manualMode} onChange={setManualMode} label="Manual Attendance Mode" />
            <Button icon={Undo2} onClick={review.undo} disabled={!review.canUndo || saving || finalizing}>
              Undo
            </Button>
            <Button icon={Save} onClick={saveDraft} loading={saving} disabled={review.dirtyCount === 0 || finalizing}>
              Save as Draft
            </Button>
            <Button variant="primary" icon={CheckCheck} onClick={() => setDialog({ type: 'finalize' })} disabled={saving || finalizing}>
              Finalize Attendance
            </Button>
          </div>
        )}
      </div>
      {!readOnly && review.dirtyCount > 0 && (
        <p className="mt-2 text-sm text-warn" role="status">
          {review.dirtyCount} unsaved {review.dirtyCount === 1 ? 'change' : 'changes'}.
        </p>
      )}
      {readOnly && (
        <p className="mt-3 flex items-center gap-2 rounded-ctl border border-ok-line bg-ok-soft px-3 py-2 text-sm text-ok" role="status">
          <Lock size={14} aria-hidden="true" />
          This attendance is finalized and read-only.
        </p>
      )}
    </div>
  );

  if (polling) {
    return (
      <>
        {header}
        <Card>
          <div role="status" className="flex flex-col items-center py-12 text-center">
            <Loader2 size={30} className="animate-spin text-primary" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink">Analyzing photographs</p>
            <p className="mt-1 text-sm text-muted">
              Detecting faces and matching them to enrolled students. This page updates when the analysis finishes.
            </p>
          </div>
        </Card>
      </>
    );
  }

  if (session.status === 'failed') {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            title="Analysis failed"
            message={session.errorMessage || 'The photographs could not be analyzed.'}
            onRetry={runAnalysis}
          />
          {analyzing && <Spinner label="Analyzing" />}
        </Card>
      </>
    );
  }

  if (!hasAnalysis) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={Camera}
            title={session.images.length ? 'This session has not been analyzed' : 'No photographs uploaded'}
            description={
              session.images.length
                ? 'Run the analysis to detect faces and match them to students.'
                : 'Upload a classroom photograph to start this attendance session.'
            }
            action={
              session.images.length ? (
                <Button variant="primary" icon={RefreshCw} loading={analyzing} onClick={runAnalysis}>
                  Analyze photographs
                </Button>
              ) : (
                <Button as={Link} to={uploadNewHref} variant="primary" icon={Camera}>
                  Upload photographs
                </Button>
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      {alerts.length > 0 && (
        <div className="mb-4 space-y-3">
          {alerts.map((item) => (
            <QualityAlert
              key={item.index ?? 'session'}
              quality={item.quality}
              photoLabel={item.index !== null && session.images.length > 1 ? `Photo ${item.index + 1}` : undefined}
              onUploadNew={() => navigate(uploadNewHref)}
            />
          ))}
        </div>
      )}

      <SessionSummary summary={built.summary} />

      {built.rows.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            title="No enrolled students found"
            description="The server returned no attendance records for this session."
          />
        </Card>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,5fr)_7fr]">
          <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
            <Card title="Classroom photographs">
              <ImageViewer
                images={session.images}
                sizes={sizes}
                faces={built.faces}
                activeIndex={activeIndex}
                onChangeIndex={setActiveIndex}
                selectedKey={selectedFaceKey}
                onSelectFace={handlers.onSelectFace}
                onUploadNew={() => navigate(uploadNewHref)}
              />
            </Card>
          </div>

          <ReviewPanel
            review={built}
            readOnly={readOnly}
            manualMode={manualMode}
            imageById={imageById}
            sizes={sizes}
            activeStudentId={selectedFace?.owner ?? null}
            selectedFaceKey={selectedFaceKey}
            handlers={handlers}
            onAddStudent={() => setDialog({ type: 'add' })}
          />
        </div>
      )}

      <ChangeStudentDialog
        open={dialog?.type === 'change'}
        face={dialog?.face}
        fromRow={dialog?.fromRow}
        rows={built.rows}
        image={dialog?.face ? imageById[dialog.face.imageId] : null}
        size={dialog?.face ? sizes[dialog.face.imageId] : null}
        onConfirm={confirmChange}
        onCancel={() => setDialog(null)}
      />
      <AddStudentDialog
        open={dialog?.type === 'add'}
        existingIds={new Set(built.rows.map((row) => row.studentId))}
        onConfirm={confirmAdd}
        onCancel={() => setDialog(null)}
      />
      <FinalizeDialog
        open={dialog?.type === 'finalize'}
        summary={built.summary}
        courseName={courseTitle}
        busy={finalizing}
        onConfirm={finalize}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
