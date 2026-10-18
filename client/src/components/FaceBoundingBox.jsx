import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { DECISION } from '../utils/constants';
import { percent } from '../utils/format';
import { faceQualityLevel } from '../utils/attendance';
import { decisionConfig } from './ConfidenceBadge';

const palette = {
  // color = box outline + label chip (kept dark so white label text stays AA) accent = the colour that draws the box in and sweeps the scan...
  [DECISION.HIGH]: { color: '#007a00', accent: '#3dff3d', fill: 'rgba(0,255,0,0.12)', border: 'solid', icon: CheckCircle2 },
  [DECISION.REVIEW]: { color: '#8a5b09', accent: '#ffb454', fill: 'rgba(138,91,9,0.20)', border: 'dashed', icon: AlertTriangle },
  [DECISION.UNKNOWN]: { color: '#b91c1c', accent: '#ff7b72', fill: 'rgba(185,28,28,0.18)', border: 'dotted', icon: HelpCircle },
};

export default function FaceBoundingBox({ face, size, selected, showLabel, onSelect }) {
  const [x1, y1, x2, y2] = face.bbox;
  const style = palette[face.decision] ?? palette[DECISION.UNKNOWN];
  const Icon = style.icon;
  const label = decisionConfig(face.decision).label;
  const score = face.similarity ? percent(face.similarity) : '';
  const quality = faceQualityLevel(face.faceQuality);
  const nearTop = y1 / size.height < 0.07;
  const fullText = `${face.name}, ${label}${score ? ` ${score}` : ''}${quality ? `, face quality ${quality}` : ''}${face.dismissed ? ', ignored' : ''}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(face.key)}
      aria-label={fullText}
      aria-pressed={selected}
      title={fullText}
      data-selected={selected}
      className="face-box group focus-visible:z-30"
      style={{
        left: `${(x1 / size.width) * 100}%`,
        top: `${(y1 / size.height) * 100}%`,
        width: `${((x2 - x1) / size.width) * 100}%`,
        height: `${((y2 - y1) / size.height) * 100}%`,
        border: `${selected ? 3 : 2}px ${style.border} ${style.color}`,
        background: style.fill,
        color: style.accent,
        opacity: face.dismissed ? 0.45 : 1,
        zIndex: selected ? 20 : 10,
      }}
    >
      {(showLabel || selected) && (
        <span
          className={`absolute left-[-2px] flex max-w-[220px] items-center gap-1 whitespace-nowrap rounded-sm px-1 py-px text-[10px] font-semibold leading-tight text-white shadow ${
            nearTop ? 'top-full mt-0.5' : 'bottom-full mb-0.5'
          }`}
          style={{ background: style.color }}
        >
          <Icon size={10} aria-hidden="true" className="shrink-0" />
          <span className="truncate">
            {selected ? face.name : face.name.split(' ')[0]}
            {score && ` ${score}`}
          </span>
          {selected && quality && <span className="shrink-0">Q: {quality}</span>}
        </span>
      )}
    </button>
  );
}
