import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useImageReady } from '../hooks/useImageReady';

function cropStyle(image, size, face, width, pad) {
  const [x1, y1, x2, y2] = face.bbox;
  const padX = (x2 - x1) * pad;
  const padY = (y2 - y1) * pad;
  const left = Math.max(0, x1 - padX);
  const top = Math.max(0, y1 - padY);
  const right = Math.min(size.width, x2 + padX);
  const bottom = Math.min(size.height, y2 + padY);
  const cropW = right - left;
  const cropH = bottom - top;
  const height = Math.round(width * (cropH / cropW));
  const posX = size.width === cropW ? 0 : (left / (size.width - cropW)) * 100;
  const posY = size.height === cropH ? 0 : (top / (size.height - cropH)) * 100;
  return {
    width,
    height: Math.min(height, width * 1.5),
    backgroundImage: `url(${image.url})`,
    backgroundSize: `${(size.width / cropW) * 100}% ${(size.height / cropH) * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
  };
}

function Lightbox({ image, size, face, onClose }) {
  useEffect(() => {
    // Capture phase + stopImmediatePropagation: Esc closes only the lightbox,
    // not the dialog it was opened from.
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const width = Math.min(Math.round(window.innerWidth * 0.86), 520);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged face"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[80] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-scrim/85 p-4 backdrop-blur-md animate-fade"
    >
      <button
        type="button"
        aria-label="Close enlarged face"
        className="absolute right-4 top-4 rounded p-1.5 text-muted transition hover:bg-white/10 hover:text-ink"
      >
        <X size={20} />
      </button>
      <div
        role="img"
        aria-label="Detected face, enlarged"
        className="rounded-panel border border-line bg-no-repeat shadow-glass-pop"
        style={cropStyle(image, size, face, width, 0.6)}
      />
      <p className="text-xs text-muted">Click anywhere or press Esc to close</p>
    </div>,
    document.body,
  );
}

/**
 * A face cut out of the classroom photo.
 *  - The shimmer keeps running until the photo is FULLY loaded and decoded, then
 *    the crop fades in (no blank / half-loaded thumbnails).
 *  - Click to enlarge (disable with expandable={false}).
 *  - onReady(bool) lets a parent hold actions until the face is actually visible.
 */
export default function FaceCrop({ image, size, face, width = 40, className = '', expandable = true, onReady }) {
  const status = useImageReady(image?.url);
  const [open, setOpen] = useState(false);
  // A failed photo counts as "settled" (shows a ? box) so it never locks the row.
  const ready = Boolean(image?.url && face) && (status === 'error' || (status === 'ok' && Boolean(size)));

  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);

  if (!ready) {
    return (
      <div
        className={`skeleton shrink-0 rounded border border-line ${className}`}
        style={{ width, height: width }}
        aria-busy="true"
        aria-label="Loading face"
        role="img"
      />
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-line bg-white/5 text-[10px] text-muted ${className}`}
        style={{ width, height: width }}
        title="Photo failed to load"
        role="img"
        aria-label="Photo failed to load"
      >
        ?
      </div>
    );
  }

  const crop = (
    <div
      role="img"
      aria-label="Detected face"
      className={`shrink-0 rounded border border-line bg-no-repeat animate-fade ${className}`}
      style={cropStyle(image, size, face, width, 0.25)}
    />
  );

  if (!expandable) return crop;
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label="Enlarge face"
        className="shrink-0 cursor-zoom-in rounded outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary"
      >
        {crop}
      </button>
      {open && <Lightbox image={image} size={size} face={face} onClose={() => setOpen(false)} />}
    </>
  );
}
