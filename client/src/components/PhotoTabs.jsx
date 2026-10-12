import { AlertTriangle, ImageOff } from 'lucide-react';
import { IMAGE_QUALITY } from '../utils/constants';

export default function PhotoTabs({ images, activeIndex, onChange }) {
  return (
    <div role="tablist" aria-label="Classroom photographs" className="flex flex-wrap gap-1.5">
      {images.map((image, index) => {
        const status = image.hasQuality ? image.imageQuality.status : 'good';
        const active = index === activeIndex;
        return (
          <button
            key={image.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(index)}
            className={`inline-flex items-center gap-1.5 rounded-ctl border px-3 py-1.5 text-sm font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 ${
              active
                ? 'border-primary bg-primary text-primary-ink shadow-glass'
                : 'border-line bg-white/10 text-ink hover:bg-white/[0.16]'
            }`}
          >
            Photo {index + 1}
            <span className={`text-xs font-normal ${active ? 'text-primary-ink/70' : 'text-muted'}`}>
              {status === IMAGE_QUALITY.UNUSABLE ? 'unusable' : `${image.faces.length} faces`}
            </span>
            {status === IMAGE_QUALITY.UNUSABLE && <ImageOff size={13} aria-hidden="true" />}
            {status === IMAGE_QUALITY.POOR && <AlertTriangle size={13} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
