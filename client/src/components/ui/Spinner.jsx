import { Loader2 } from 'lucide-react';

export default function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 py-10 text-sm text-muted animate-fade ${className}`}
    >
      <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
