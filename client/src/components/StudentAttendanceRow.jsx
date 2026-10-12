import { ArrowLeftRight, Check, EyeOff, X } from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';
import FaceCrop from './FaceCrop';
import FaceQualityLabel from './FaceQualityLabel';
import FinalStatusBadge from './FinalStatusBadge';
import SourceBadge from './SourceBadge';
import { percent } from '../utils/format';

function ToggleButton({ pressed, tone, icon: Icon, children, onClick }) {
  const active =
    tone === 'ok' ? 'border-ok-dark bg-ok-dark text-white' : 'border-bad-dark bg-bad-dark text-white';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 ${
        pressed ? active : 'border-line bg-white/10 text-ink hover:bg-white/[0.16]'
      }`}
    >
      <Icon size={12} aria-hidden="true" />
      {children}
    </button>
  );
}

export default function StudentAttendanceRow({
  row,
  variant,
  readOnly,
  manualMode,
  selected,
  active,
  image,
  size,
  onToggleSelect,
  onPresent,
  onAbsent,
  onChange,
  onIgnore,
  onFocus,
}) {
  const hasFace = Boolean(row.face);
  const showAi = variant !== 'undetected';

  return (
    <tr
      id={`row-${row.studentId}`}
      onClick={() => onFocus?.(row)}
      className={`border-b border-line align-top transition-colors duration-150 last:border-b-0 ${
        active ? 'bg-primary-soft' : 'hover:bg-white/[0.06]'
      }`}
    >
      {manualMode && !readOnly && (
        <td className="px-2 py-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.studentId)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${row.name}`}
          />
        </td>
      )}
      <td className="whitespace-nowrap px-2 py-2 text-sm tabular-nums text-ink">{row.rollNumber}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          {showAi && hasFace && <FaceCrop image={image} size={size} face={row.face} width={32} />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{row.name || row.studentId}</p>
            {row.ignored && <p className="text-xs text-muted">Face ignored</p>}
            {row.isAdded && <p className="text-xs text-muted">Added manually</p>}
          </div>
        </div>
      </td>
      {showAi && (
        <>
          <td className="px-2 py-2">
            <ConfidenceBadge decision={row.aiResult} />
            {hasFace && row.face.imageIndex !== undefined && (
              <p className="mt-1 text-xs text-muted">Photo {row.face.imageIndex + 1}</p>
            )}
          </td>
          <td className="px-2 py-2">
            {hasFace ? (
              <>
                <p className="text-sm font-semibold tabular-nums text-ink">{percent(row.similarity)}</p>
                <FaceQualityLabel score={row.faceQuality} />
              </>
            ) : (
              <span className="text-sm text-muted">None</span>
            )}
          </td>
        </>
      )}
      <td className="px-2 py-2">
        <SourceBadge source={row.source} />
      </td>
      <td className="px-2 py-2">
        <FinalStatusBadge status={row.status} />
        {row.needsAttention && <p className="mt-1 text-xs font-semibold text-warn">Review needed</p>}
      </td>
      <td className="px-2 py-2">
        {readOnly ? (
          <span className="text-xs text-muted">Locked</span>
        ) : (
          <div className="flex flex-col items-start gap-1.5" onClick={(event) => event.stopPropagation()}>
            <div className="inline-flex overflow-hidden rounded-ctl">
              <ToggleButton pressed={row.status === 'present'} tone="ok" icon={Check} onClick={() => onPresent(row)}>
                Present
              </ToggleButton>
              <ToggleButton pressed={row.status !== 'present'} tone="bad" icon={X} onClick={() => onAbsent(row)}>
                Absent
              </ToggleButton>
            </div>
            {hasFace && showAi && (
              <div className="flex gap-3 text-xs font-semibold text-primary">
                <button type="button" onClick={() => onChange(row)} className="inline-flex items-center gap-1 hover:underline">
                  <ArrowLeftRight size={12} aria-hidden="true" />
                  Change Student
                </button>
                <button type="button" onClick={() => onIgnore(row)} className="inline-flex items-center gap-1 hover:underline">
                  <EyeOff size={12} aria-hidden="true" />
                  Ignore
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
