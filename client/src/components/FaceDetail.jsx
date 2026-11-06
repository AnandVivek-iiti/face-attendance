import ConfidenceBadge from './ConfidenceBadge';
import FaceCrop from './FaceCrop';
import FaceQualityLabel from './FaceQualityLabel';
import { matchNote } from '../utils/attendance';
import { percent } from '../utils/format';

export default function FaceDetail({ face, image, size }) {
  if (!face) {
    return <p className="text-sm text-muted">Select a box on the photograph to see its details.</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <FaceCrop image={image} size={size} face={face} width={56} />
      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
        <dt className="text-muted">Student</dt>
        <dd className="font-semibold text-ink">{face.name}</dd>
        <dt className="text-muted">Decision</dt>
        <dd><ConfidenceBadge decision={face.decision} /></dd>
        <dt className="text-muted">Similarity</dt>
        <dd className="tabular-nums text-ink">{face.similarity ? percent(face.similarity, 1) : 'Not compared'}</dd>
        <dt className="text-muted">Face quality</dt>
        <dd><FaceQualityLabel score={face.faceQuality} />{face.qualityTier ? ` · ${face.qualityTier}` : ''}</dd>
        <dt className="text-muted">Match margin</dt>
        <dd className="tabular-nums text-ink">{face.matchMargin == null ? 'Not available' : percent(face.matchMargin, 1)}</dd>
        {face.decision === 'high_confidence' ? (
          <><dt className="text-muted">Decision reason</dt><dd className="col-span-2 text-xs font-medium text-ok-dark">Identity, match margin and face-quality checks passed.</dd></>
        ) : face.decisionReason ? (
          <><dt className="text-muted">Decision reason</dt><dd className="col-span-2 text-xs text-warn">{face.decisionReason.split(';').map((value) => value.replaceAll('_', ' ')).join(' · ')}</dd></>
        ) : null}
        {matchNote(face) && <dd className="col-span-2 text-xs text-muted">{matchNote(face)}</dd>}
      </dl>
    </div>
  );
}
