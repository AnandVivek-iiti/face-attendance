import { faceQualityLevel } from '../utils/attendance';
import { percent } from '../utils/format';

export default function FaceQualityLabel({ score }) {
  const level = faceQualityLevel(score);
  if (!level) return <span className="text-xs text-muted">Quality unknown</span>;
  return (
    <span className="text-xs text-muted">
      Face quality: {level} ({percent(score)})
    </span>
  );
}
