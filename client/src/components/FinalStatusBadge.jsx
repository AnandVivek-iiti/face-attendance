import { Check, X } from 'lucide-react';
import Badge from './ui/Badge';

export default function FinalStatusBadge({ status }) {
  if (status === 'present') {
    return (
      <Badge tone="ok" icon={Check}>
        Present
      </Badge>
    );
  }
  return (
    <Badge tone="bad" icon={X}>
      Absent
    </Badge>
  );
}
