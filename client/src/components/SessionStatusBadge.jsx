import { AlertTriangle, ClipboardCheck, Loader2, Lock, Pencil } from 'lucide-react';
import Badge from './ui/Badge';

const config = {
  finalized: { tone: 'ok', icon: Lock, label: 'Finalized' },
  draft: { tone: 'warn', icon: Pencil, label: 'Draft' },
  review: { tone: 'warn', icon: ClipboardCheck, label: 'Awaiting review' },
  processing: { tone: 'info', icon: Loader2, label: 'Analyzing' },
  failed: { tone: 'bad', icon: AlertTriangle, label: 'Failed' },
};

export default function SessionStatusBadge({ status }) {
  const entry = config[status] ?? { tone: 'neutral', icon: Pencil, label: status || 'Unknown' };
  return (
    <Badge tone={entry.tone} icon={entry.icon}>
      {entry.label}
    </Badge>
  );
}
