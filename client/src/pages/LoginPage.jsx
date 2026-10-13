import { useEffect, useId, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ScanFace } from 'lucide-react';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* One-shot text decode on mount. Monospace glyphs keep the width constant, so
   the heading never reflows while it resolves. */
const GLYPHS = '01<>[]{}#$%&*+=/';
function Decode({ text }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const start = performance.now();
    const total = 700;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / total);
      const settled = Math.floor(progress * text.length);
      setOut(
        text
          .split('')
          .map((ch, i) => (i < settled || ch === ' ' ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(''),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setOut(text);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return (
    <>
      <span aria-hidden="true">{out}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

/* Decorative preview of what the app does: a scan sweeps a classroom photo and
   each face gets boxed and scored. Colours match the real review statuses. */
const HEADS = [
  [70, 150], [150, 140], [230, 150], [310, 138], [390, 148],
  [100, 235], [185, 228], [270, 238], [355, 230],
];
const STATUS = ['ok', 'ok', 'ok', 'warn', 'ok', 'warn', 'ok', 'bad', 'ok'];
const SCORE = ['0.97', '0.95', '0.98', '0.61', '0.96', '0.58', '0.97', 'none', '0.94'];
const TONE = { ok: '#3dff3d', warn: '#ffb454', bad: '#ff7b72' };

function ClassroomScan() {
  return (
    <svg viewBox="0 0 460 320" className="w-full max-w-md" aria-hidden="true">
      <defs>
        <linearGradient id="scan-trail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00ff00" stopOpacity="0" />
          <stop offset="1" stopColor="#00ff00" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="459" height="319" fill="rgba(0,255,0,0.03)" stroke="rgba(0,255,0,0.22)" />
      {HEADS.map(([x, y], index) => {
        const delay = `${(0.3 + (y / 312) * 2.2 + x / 1500).toFixed(2)}s`;
        const color = TONE[STATUS[index]];
        return (
          <g key={index}>
            <circle cx={x} cy={y} r="17" fill="#0a5a0a" />
            <path d={`M${x - 28} ${y + 58} a28 28 0 0 1 56 0 z`} fill="#013b00" />
            <rect
              className="hud-box"
              pathLength="1"
              x={x - 26}
              y={y - 27}
              width="52"
              height="54"
              fill="none"
              stroke={color}
              strokeWidth="2"
              style={{ '--d': delay }}
            />
            <text
              className="hud-label"
              x={x - 26}
              y={y + 38}
              fontSize="9"
              fill={color}
              fontFamily="'JetBrains Mono', monospace"
              style={{ '--d': delay }}
            >
              {SCORE[index]}
            </text>
          </g>
        );
      })}
      <g className="hud-scan">
        <rect x="1" y="-26" width="458" height="26" fill="url(#scan-trail)" />
        <rect x="1" y="0" width="458" height="1.5" fill="#00ff00" />
      </g>
    </svg>
  );
}

const LOG = [
  ['ok', 'frame received, 4032 x 3024'],
  ['ok', '9 faces found'],
  ['ok', '6 matched to enrolled students'],
  ['warn', '2 need your review'],
  ['miss', '1 not recognised'],
  ['ok', 'nothing is saved until you confirm'],
];
const LOG_TAG = { ok: ['[ ok ]', 'text-ok'], warn: ['[warn]', 'text-warn'], miss: ['[miss]', 'text-bad'] };

function BootLog() {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? LOG.length : 0));
  useEffect(() => {
    if (count >= LOG.length) return undefined;
    const timer = setTimeout(() => setCount((n) => n + 1), count === 0 ? 1000 : 480);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <ul aria-hidden="true" className="h-[10.5rem] space-y-0.5 text-xs leading-5">
      {LOG.slice(0, count).map(([tone, text], index) => (
        <li key={text} className="flex gap-3">
          <span className={`shrink-0 ${LOG_TAG[tone][1]}`}>{LOG_TAG[tone][0]}</span>
          <span className="text-muted">
            {text}
            {index === count - 1 && <span className="term-block ml-1" />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TermField({ label, trailing, ...rest }) {
  const id = useId();
  return (
    <div className="term-row">
      <label htmlFor={id} className="w-28 shrink-0 text-muted">
        {label}
        <span aria-hidden="true" className="text-primary">{' ›'}</span>
      </label>
      <input id={id} spellCheck={false} {...rest} />
      {trailing}
    </div>
  );
}

export default function LoginPage() {
  const { isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (isAuthenticated) {
    const needsSetup = user?.role === 'student' && !user?.profileComplete;
    return <Navigate to={needsSetup ? '/student/profile' : '/dashboard'} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setStage(1);
    setError(null);
    timer.current = setTimeout(() => setStage(2), 450);
    try {
      const signedIn = await signIn(email.trim(), password);
      // First-time students go straight to mandatory profile setup and cannot
      // skip it; everyone else lands where they were headed (or dashboard).
      const needsSetup = signedIn?.role === 'student' && !signedIn?.profileComplete;
      navigate(needsSetup ? '/student/profile' : location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      clearTimeout(timer.current);
      const status = err.response?.status;
      setError(status === 401 || status === 400 ? 'Email or password is incorrect.' : getErrorMessage(err));
      setStage(0);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen animate-page-in lg:grid-cols-2">
      <div className="hidden flex-col justify-center gap-6 border-r border-line bg-black/25 px-14 lg:flex">
        <ClassroomScan />
        <BootLog />
        <div className="max-w-md">
          <h2 className="font-serif text-xl font-bold text-ink">Attendance from a classroom photograph</h2>
          <p className="mt-2 text-sm text-muted">
            Faces are matched to enrolled students. Anything uncertain is flagged for you to confirm before attendance is saved.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <form onSubmit={submit} noValidate className="glass-strong scan-once rounded-panel border border-line p-6 shadow-glass-lg">
            <div className="mb-5 flex items-center gap-2 border-b border-line pb-3 text-sm font-semibold text-ink">
              <ScanFace size={18} className="text-primary" aria-hidden="true" />
              Face Attendance
            </div>

            <h1 className="font-serif text-2xl font-bold text-ink">
              <span aria-hidden="true" className="mr-2 text-primary">$</span>
              <Decode text="Sign in" />
            </h1>
            <p className="mb-5 mt-1 text-sm text-muted">Use the account issued by your institution.</p>

            <div className="space-y-3">
              <TermField
                label="Email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <TermField
                label="Password"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setReveal((value) => !value)}
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    className="rounded p-0.5 text-muted transition-colors hover:text-primary"
                  >
                    {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                }
              />
            </div>

            {/* Fixed height: status text changes never move the button. */}
            <div className="mt-4 h-[4.25rem] text-xs leading-5" role="status" aria-live="polite">
              {error && (
                <div role="alert">
                  <p className="text-bad">✕ access denied</p>
                  <p className="text-muted">{error}</p>
                </div>
              )}
              {!error && !busy && (
                <p className="text-muted">
                  awaiting credentials<span className="term-block ml-1" />
                </p>
              )}
              {busy && (
                <>
                  <p className="text-muted">› connecting</p>
                  {stage >= 2 && (
                    <p className="text-primary">
                      › verifying credentials<span className="term-block ml-1" />
                    </p>
                  )}
                </>
              )}
            </div>

            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email || !password} className="w-full">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
