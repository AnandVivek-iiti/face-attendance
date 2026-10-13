import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, title, onClose, children, footer, width = 'max-w-lg' }) {
  const panel = useRef(null);

  // Keep the latest onClose in a ref. Parents pass fresh arrow functions on
  // every render, and when onClose was an effect dependency the effect re-ran
  // after each keystroke and pulled focus off the input, so only one character
  // could be typed at a time.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    if (!panel.current?.contains(previous)) panel.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/75 p-4 pt-[10vh] animate-fade">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`glass-strong scan-once w-full ${width} rounded-panel border border-line shadow-glass-pop outline-none animate-fade`}
      >
        <header className="flex items-center justify-between border-b border-line bg-white/[0.03] px-4 py-3">
          <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-muted transition hover:bg-white/10 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
