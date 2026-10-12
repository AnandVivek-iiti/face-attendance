import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({ message, onRetry, title = 'Could not load this page' }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center animate-fade">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-bad-line bg-bad-soft text-bad">
        <AlertTriangle size={24} aria-hidden="true" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-4" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
