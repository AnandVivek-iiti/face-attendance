import { ArrowLeftRight, EyeOff } from 'lucide-react';
import Button from './ui/Button';
import ConfidenceBadge from './ConfidenceBadge';
import FaceCrop from './FaceCrop';
import FaceQualityLabel from './FaceQualityLabel';
import { matchNote } from '../utils/attendance';
import { plural } from '../utils/format';

export default function UnmatchedFacesPanel({ faces, readOnly, imageById, sizes, selectedKey, onSelect, onAssign, onDismiss }) {
  if (!faces.length) return null;
  return (
    <section aria-labelledby="unmatched-heading" className="glass animate-rise rounded-panel border border-bad-line">
      <header className="border-b border-bad-line bg-bad-soft px-4 py-3">
        <h3 id="unmatched-heading" className="font-serif text-base font-semibold text-bad">
          Faces not matched to a student, {faces.length}
        </h3>
        <p className="text-xs text-ink">
          Assign each {plural(faces.length, 'face')} to a student or ignore it. Nobody is marked present from these faces automatically.
        </p>
      </header>
      <ul className="stagger divide-y divide-line">
        {faces.map((face) => (
          <li
            key={face.key}
            className={`flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors ${
              selectedKey === face.key ? 'bg-primary-soft' : 'hover:bg-white/[0.05]'
            }`}
          >
            <button type="button" onClick={() => onSelect(face.key)} className="flex items-center gap-3 text-left">
              <FaceCrop image={imageById[face.imageId]} size={sizes[face.imageId]} face={face} width={44} />
              <span>
                <span className="block text-sm font-semibold text-ink">{face.name}</span>
                <span className="block text-xs text-muted">Photo {face.imageIndex + 1}</span>
                <FaceQualityLabel score={face.faceQuality} />
                {matchNote(face) && <span className="block text-xs text-muted">{matchNote(face)}</span>}
              </span>
            </button>
            <ConfidenceBadge decision={face.decision} similarity={face.similarity} showScore />
            {!readOnly && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" icon={ArrowLeftRight} onClick={() => onAssign(face)}>
                  Assign student
                </Button>
                <Button size="sm" icon={EyeOff} onClick={() => onDismiss(face)}>
                  Ignore
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
