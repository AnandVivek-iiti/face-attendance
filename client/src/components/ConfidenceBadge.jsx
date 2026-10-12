import { AlertTriangle, CheckCircle2, EyeOff, HelpCircle } from 'lucide-react';
import Badge from './ui/Badge';
import { percent } from '../utils/format';
import { DECISION } from '../utils/constants';

const config = {
  [DECISION.HIGH]: { tone: 'ok', icon: CheckCircle2, label: 'High confidence', style: 'solid' },
  [DECISION.REVIEW]: { tone: 'warn', icon: AlertTriangle, label: 'Needs review', style: 'dashed' },
  [DECISION.UNKNOWN]: { tone: 'bad', icon: HelpCircle, label: 'Unknown', style: 'dotted' },
  [DECISION.NONE]: { tone: 'neutral', icon: EyeOff, label: 'Not detected', style: 'solid' },
};

export function decisionConfig(decision) {
  return config[decision] ?? config[DECISION.UNKNOWN];
}

export default function ConfidenceBadge({ decision, similarity, showScore = false }) {
  const { tone, icon, label, style } = decisionConfig(decision);
  const score = showScore && similarity ? ` ${percent(similarity)}` : '';
  return (
    <Badge tone={tone} icon={icon} borderStyle={style}>
      {label}
      {score}
    </Badge>
  );
}
