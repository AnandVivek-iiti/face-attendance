import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  // Dismissing flags the toast as leaving so it can play its exit animation,
  // then removes it once that animation (0.22s in index.css) is done.
  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 220);
  }, []);

  const push = useCallback(
    (message, tone = 'success') => {
      const id = nextId.current++;
      const duration = tone === 'error' ? 7000 : 4000;
      setToasts((current) => [...current, { id, message, tone, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const isError = toast.tone === 'error';
          const Icon = isError ? AlertTriangle : CheckCircle2;
          return (
            <div
              key={toast.id}
              role={isError ? 'alert' : 'status'}
              className={`pointer-events-auto relative flex items-start gap-2 overflow-hidden rounded-ctl border px-3 py-2 text-sm shadow-glass ${
                toast.leaving ? 'toast-out' : 'animate-toast'
              } ${
                isError
                  ? 'border-bad-line bg-[rgba(60,14,12,0.9)] text-bad'
                  : 'border-ok-line bg-[rgba(1,59,0,0.94)] text-ok'
              }`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="flex-1">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss message">
                <X size={14} />
              </button>
              <span aria-hidden="true" className="toast-timer" style={{ animationDuration: `${toast.duration}ms` }} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
