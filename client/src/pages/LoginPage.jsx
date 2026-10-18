import { useEffect, useId, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Camera, CheckCheck, Eye, EyeOff, ScanFace, Sparkles } from 'lucide-react';
import ThemeSwitcher from '../components/ThemeSwitcher';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getAuthConfig, requestMagicLink } from '../services/authService';
import { API_BASE_URL } from '../services/http';
import { getErrorMessage } from '../utils/errors';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// One-shot text decode on mount.
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

// Decorative preview of what the app does: a scan sweeps a classroom photo and each face gets boxed and scored.
const HEADS = [
  [70, 150], [150, 140], [230, 150], [310, 138], [390, 148],
  [100, 235], [185, 228], [270, 238], [355, 230],
];
const STATUS = ['ok', 'ok', 'ok', 'warn', 'ok', 'warn', 'ok', 'bad', 'ok'];
const SCORE = ['0.97', '0.95', '0.98', '0.61', '0.96', '0.58', '0.97', 'none', '0.94'];
const TONE = { ok: 'rgb(var(--ok-rgb))', warn: 'rgb(var(--warn-rgb))', bad: 'rgb(var(--bad-rgb))' };

function ClassroomScan() {
  return (
    <svg viewBox="0 0 460 320" className="w-full max-w-md drop-shadow-[0_0_28px_rgb(var(--accent-rgb)/0.25)]" aria-hidden="true">
      <defs>
        <linearGradient id="scan-trail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--accent-rgb))', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--accent-rgb))', stopOpacity: 0.3 }} />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="459"
        height="319"
        style={{ fill: 'rgb(var(--accent-rgb) / 0.05)', stroke: 'rgb(var(--accent-rgb) / 0.35)' }}
      />
      {HEADS.map(([x, y], index) => {
        const delay = `${(0.3 + (y / 312) * 2.2 + x / 1500).toFixed(2)}s`;
        const color = TONE[STATUS[index]];
        return (
          <g key={index}>
            <circle cx={x} cy={y} r="17" style={{ fill: 'rgb(var(--ink-rgb) / 0.22)' }} />
            <path d={`M${x - 28} ${y + 58} a28 28 0 0 1 56 0 z`} style={{ fill: 'rgb(var(--ink-rgb) / 0.12)' }} />
            <rect
              className="hud-box"
              pathLength="1"
              x={x - 26}
              y={y - 27}
              width="52"
              height="54"
              fill="none"
              strokeWidth="2"
              style={{ stroke: color, '--d': delay }}
            />
            <text
              className="hud-label"
              x={x - 26}
              y={y + 38}
              fontSize="9"
              fontFamily="'JetBrains Mono', monospace"
              style={{ fill: color, '--d': delay }}
            >
              {SCORE[index]}
            </text>
          </g>
        );
      })}
      <g className="hud-scan">
        <rect x="1" y="-26" width="458" height="26" fill="url(#scan-trail)" />
        <rect x="1" y="0" width="458" height="1.5" style={{ fill: 'rgb(var(--accent-rgb))' }} />
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

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { isAuthenticated, user, signIn, signInWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(null);
  const [mode, setMode] = useState('password');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    let active = true;
    getAuthConfig().then((config) => {
      if (!active) return;
      setGoogleEnabled(Boolean(config?.googleEnabled));
    });
    return () => {
      active = false;
    };
  }, []);

  // Handles the return leg of the Google round-trip: the server redirects back with ?token=<jwt> on success or ?error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const tokenParam = params.get('token');
    if (!errorParam && !tokenParam) return;
    window.history.replaceState({}, '', window.location.pathname);

    if (errorParam) {
      const messages = {
        google_not_configured: 'Google sign-in is not configured on this server.',
        google_wrong_domain: 'Use your @iiti.ac.in Google account.',
        google_unverified_email: 'Your Google email address is not verified.',
        google_no_email: 'Google did not share an email address for your account.',
        verify_invalid: 'That sign-in link is invalid or has expired. Request a new one.',
      };
      setError(messages[errorParam] || 'Sign-in failed. Please try again or use your email and password.');
      return;
    }

    setBusy(true);
    setStage(1);
    signInWithToken(tokenParam)
      .then((signedIn) => {
        const needsSetup = signedIn?.role === 'student' && !signedIn?.profileComplete;
        navigate(needsSetup ? '/student/profile' : '/dashboard', { replace: true });
      })
      .catch((err) => {
        setError(getErrorMessage(err));
        setStage(0);
        setBusy(false);
      });
  }, [navigate, signInWithToken]);

  if (isAuthenticated) {
    const needsSetup = user?.role === 'student' && !user?.profileComplete;
    return <Navigate to={needsSetup ? '/student/profile' : '/dashboard'} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setPending('signin');
    setStage(1);
    setError(null);
    setNotice(null);
    timer.current = setTimeout(() => setStage(2), 450);
    try {
      const signedIn = await signIn(email.trim(), password);
      // First-time students go straight to mandatory profile setup and cannot skip it; everyone else lands where they were headed (or dashboard).
      const needsSetup = signedIn?.role === 'student' && !signedIn?.profileComplete;
      navigate(needsSetup ? '/student/profile' : location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      clearTimeout(timer.current);
      const status = err.response?.status;
      setError(status === 401 || status === 400 ? 'Email or password is incorrect.' : getErrorMessage(err));
      setStage(0);
      setBusy(false);
      setPending(null);
    }
  };

  // Requesting a one-time sign-in link lives on its own screen (email only).
  const submitMagic = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setPending('link');
    setError(null);
    setNotice(null);
    try {
      const result = await requestMagicLink(email.trim());
      setNotice(
        result?.delivered === false
          ? 'The request went through, but the email could not be sent right now. Ask your admin to share a sign-in link.'
          : 'If that address has an account, a sign-in link is on its way. Open it on this device.',
      );
    } catch (err) {
      const status = err.response?.status;
      setError(status === 429 ? 'Too many link requests. Try again in a few minutes.' : getErrorMessage(err));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const useLink = mode === 'link';
  const disabled = useLink ? !email : !email || !password;

  return (
    <div className="grid min-h-screen animate-page-in lg:grid-cols-[1.1fr_1fr]">
      <div className="fixed right-4 top-4 z-20">
        <ThemeSwitcher compact />
      </div>

      <div className="login-hero hidden flex-col justify-center gap-6 border-r border-line px-14 py-10 lg:flex">
        <div className="max-w-xl animate-rise">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
            <Sparkles size={14} aria-hidden="true" />
            Face Attendance
          </p>
          <h2 className="hero-title font-serif text-5xl font-extrabold leading-[1.05] tracking-tight">
            Attendance from a classroom photograph
          </h2>
          <p className="mt-4 max-w-md text-sm text-muted">
            Faces are matched to enrolled students. Anything uncertain is flagged for you to confirm before attendance is saved.
          </p>
        </div>
        <ClassroomScan />
        <ul className="stagger flex max-w-md flex-wrap gap-2 text-xs font-semibold text-ink">
          {[
            [Camera, 'Capture'],
            [ScanFace, 'Match'],
            [CheckCheck, 'Confirm'],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-2 rounded-full border border-line bg-white/[0.05] px-3 py-1.5">
              <Icon size={14} aria-hidden="true" className="text-primary" />
              {text}
            </li>
          ))}
        </ul>
        <BootLog />
      </div>

      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="login-ring animate-pop">
          <form onSubmit={useLink ? submitMagic : submit} noValidate className="stagger glass-strong scan-once rounded-panel border border-line p-7">
            <div className="mb-5 flex items-center gap-2 border-b border-line pb-3 text-sm font-semibold text-ink">
              <ScanFace size={18} className="text-primary" aria-hidden="true" />
              Face Attendance
            </div>

            <h1 className="font-serif text-4xl font-extrabold tracking-tight text-ink">
              <span aria-hidden="true" className="mr-2 text-primary">$</span>
              <Decode text="Sign in" />
            </h1>

            <div className="mt-5 space-y-3">
              <TermField
                label="Email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              {!useLink && (
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
              )}
            </div>

            {!useLink && googleEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => {
                  window.location.href = `${API_BASE_URL}/api/auth/google`;
                }}
                className="mt-3 w-full justify-center gap-2"
              >
                <GoogleIcon />
                Continue with Google
              </Button>
            )}

            {!useLink && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => {
                  setMode('link');
                  setError(null);
                  setNotice(null);
                  setStage(0);
                }}
                className="mt-3 w-full justify-center gap-2"
              >
                Send me login link
              </Button>
            )}

            {useLink && (
              <button
                type="button"
                onClick={() => {
                  setMode('password');
                  setError(null);
                  setNotice(null);
                  setStage(0);
                }}
                className="mt-3 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Use email and password instead
              </button>
            )}

            {/* Fixed height: status text changes never move the button. */}
            <div className="mt-4 h-[4.25rem] text-xs leading-5" role="status" aria-live="polite">
              {error && (
                <div role="alert">
                  <p className="text-bad">✕ access denied</p>
                  <p className="text-muted">{error}</p>
                </div>
              )}
              {!error && notice && (
                <div>
                  <p className="text-ok">✓ link sent</p>
                  <p className="text-muted">{notice}</p>
                </div>
              )}
              {!error && !notice && !busy && (
                <p className="text-muted">
                  {useLink ? 'awaiting email' : 'awaiting credentials'}
                  <span className="term-block ml-1" />
                </p>
              )}
              {busy && (
                <>
                  <p className="text-muted">› connecting</p>
                  {pending === 'link' ? (
                    <p className="text-primary">
                      › sending link
                      <span className="term-block ml-1" />
                    </p>
                  ) : (
                    stage >= 2 && (
                      <p className="text-primary">
                        › verifying credentials
                        <span className="term-block ml-1" />
                      </p>
                    )
                  )}
                </>
              )}
            </div>

            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={disabled} className="w-full">
              {useLink ? 'Send me a sign-in link' : 'Sign in'}
            </Button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
