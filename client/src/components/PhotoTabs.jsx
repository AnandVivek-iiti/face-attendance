import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, ImageOff } from 'lucide-react';
import { IMAGE_QUALITY } from '../utils/constants';

export default function PhotoTabs({ images, activeIndex, onChange }) {
  const listRef = useRef(null);
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  // The highlight is one element that slides to whichever tab is selected.
  const measure = useCallback(() => {
    const active = listRef.current?.querySelector('[aria-selected="true"]');
    if (!active) return;
    setBox({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, activeIndex, images]);

  useEffect(() => {
    // Enable the slide only after the first placement, so it does not fly in from the corner.
    const frame = requestAnimationFrame(() => setReady(true));
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <div ref={listRef} role="tablist" aria-label="Classroom photographs" className="relative flex flex-wrap gap-1.5">
      <span
        aria-hidden="true"
        className="tab-indicator"
        data-ready={ready && box.w > 0}
        style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
      />
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
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-ctl border px-3 py-1.5 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.96] ${
              active
                ? 'border-transparent bg-transparent text-primary-ink'
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
