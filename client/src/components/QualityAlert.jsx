import { AlertTriangle, ImageOff, Upload } from 'lucide-react';
import Button from './ui/Button';
import { IMAGE_QUALITY } from '../utils/constants';

export default function QualityAlert({ quality, photoLabel, onUploadNew, compact = false }) {
  if (!quality || quality.status === IMAGE_QUALITY.GOOD) return null;
  const unusable = quality.status === IMAGE_QUALITY.UNUSABLE;
  const Icon = unusable ? ImageOff : AlertTriangle;
  const title = unusable ? 'Image quality is insufficient.' : 'Image quality is low.';
  const reason = quality.message || 'The server did not return a reason.';

  return (
    <div
      role="alert"
      className={`animate-rise rounded-panel border-2 ${
        unusable ? 'border-bad bg-bad-soft text-bad' : 'border-warn-line bg-warn-soft text-warn'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <Icon size={compact ? 18 : 24} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className={`font-bold ${compact ? 'text-sm' : 'text-base'}`}>
            {photoLabel ? `${photoLabel}: ` : ''}
            {title}
          </p>
          <p className="mt-0.5 text-sm text-ink">{reason}</p>
          {(quality.blurScore !== null || quality.brightnessScore !== null) && (
            <p className="mt-1 text-xs text-muted">
              {quality.blurScore !== null && `Blur score ${quality.blurScore}. `}
              {quality.brightnessScore !== null && `Brightness ${quality.brightnessScore}.`}
            </p>
          )}
          {unusable && (
            <p className="mt-1 text-xs text-ink">Attendance is not marked from this image.</p>
          )}
          {unusable && onUploadNew && (
            <Button className="mt-3" variant="danger" icon={Upload} onClick={onUploadNew}>
              Upload New Image
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
