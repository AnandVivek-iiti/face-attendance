import { Pencil, ScanFace, UserCheck } from 'lucide-react';
import Badge from './ui/Badge';
import { SOURCE } from '../utils/constants';

const config = {
  [SOURCE.AI]: { tone: 'neutral', icon: ScanFace, label: 'AI' },
  [SOURCE.REVIEWED]: { tone: 'info', icon: UserCheck, label: 'AI + Reviewed' },
  [SOURCE.MANUAL]: { tone: 'info', icon: Pencil, label: 'Manual' },
};

export default function SourceBadge({ source }) {
  const { tone, icon, label } = config[source] ?? config[SOURCE.AI];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
