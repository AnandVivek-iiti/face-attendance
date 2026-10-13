import { RefreshCw } from 'lucide-react';
import AsciiSpinner from './ui/AsciiSpinner';
import Button from './ui/Button';
import ProgressBar from './ui/ProgressBar';

const steps = [
  { id: 'creating', label: 'Creating attendance session' },
  { id: 'uploading', label: 'Uploading photographs' },
  { id: 'analyzing', label: 'Analyzing faces' },
];

export default function UploadProgress({ stage, failedStage, uploadProgress, error, onRetry, onCancel }) {
  const current = stage === 'error' ? failedStage : stage;
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <div className="glass animate-rise rounded-panel border border-line p-4" aria-live="polite">
      <ul className="stagger space-y-3">
        {steps.map((step, index) => {
          const failed = stage === 'error' && step.id === failedStage;
          const done = stage === 'done' || index < currentIndex;
          const active = !failed && !done && step.id === current;
          let tone = 'text-muted';
          if (done) tone = 'text-ok';
          else if (failed) tone = 'text-bad';
          else if (active) tone = 'text-primary';
          return (
            <li key={step.id}>
              <div className="flex items-center gap-2 text-sm">
                <span className={`shrink-0 whitespace-pre ${tone}`} aria-hidden="true">
                  {done && '[ ok ]'}
                  {failed && '[fail]'}
                  {active && (
                    <>
                      {'[ '}
                      <AsciiSpinner />
                      {'  ]'}
                    </>
                  )}
                  {!done && !failed && !active && '[    ]'}
                </span>
                <span className={active || failed ? 'font-semibold text-ink' : 'text-muted'}>{step.label}</span>
                {done && <span className="sr-only">Done</span>}
                {failed && <span className="sr-only">Failed</span>}
              </div>
              {active && step.id === 'uploading' && (
                <div className="ml-6 mt-2 flex items-center gap-3">
                  <ProgressBar value={uploadProgress} label="Upload progress" />
                  <span className="w-10 text-right text-xs tabular-nums text-primary">
                    {Math.round(uploadProgress * 100)}%
                  </span>
                </div>
              )}
              {active && step.id === 'analyzing' && (
                <div className="ml-6 mt-2">
                  <ProgressBar value={0} indeterminate label="Analysis progress" />
                  <p className="mt-1 text-xs text-muted">Large classes can take a minute or two.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {stage === 'error' && (
        <div role="alert" className="mt-4 rounded-ctl border border-bad-line bg-bad-soft p-3 text-sm">
          <p className="font-semibold text-bad">{error}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" icon={RefreshCw} onClick={onRetry}>
              Retry
            </Button>
            <Button onClick={onCancel}>Start over</Button>
          </div>
        </div>
      )}
    </div>
  );
}
