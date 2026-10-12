import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ScanFace } from 'lucide-react';
import Button from '../components/ui/Button';
import { TextInput } from '../components/ui/Field';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

function ClassroomMotif() {
  const heads = [
    [70, 150], [150, 140], [230, 150], [310, 138], [390, 148],
    [100, 235], [185, 228], [270, 238], [355, 230],
  ];
  const boxes = {
    0: { color: '#3ddc97', dash: '0' },
    1: { color: '#3ddc97', dash: '0' },
    3: { color: '#fbbf24', dash: '6 4' },
    6: { color: '#3ddc97', dash: '0' },
    7: { color: '#ff8f85', dash: '2 4' },
  };
  return (
    <svg viewBox="0 0 460 320" className="w-full max-w-md" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="458"
        height="318"
        rx="10"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.14)"
      />
      {heads.map(([x, y], index) => (
        <g key={index}>
          <circle cx={x} cy={y} r="17" fill="#1d5c47" />
          <path d={`M${x - 28} ${y + 58} a28 28 0 0 1 56 0 z`} fill="#154536" />
          {boxes[index] && (
            <rect
              x={x - 26}
              y={y - 27}
              width="52"
              height="54"
              rx="2"
              fill="none"
              stroke={boxes[index].color}
              strokeWidth="2.5"
              strokeDasharray={boxes[index].dash}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

export default function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (err) {
      const status = err.response?.status;
      setError(status === 401 || status === 400 ? 'Email or password is incorrect.' : getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen animate-page-in lg:grid-cols-2">
      <div className="hidden flex-col justify-center gap-6 border-r border-line bg-white/[0.03] px-14 backdrop-blur-glass lg:flex">
        <div className="animate-rise">
          <ClassroomMotif />
        </div>
        <div className="max-w-md animate-rise">
          <h2 className="font-serif text-2xl font-bold text-ink">Attendance from a classroom photograph</h2>
          <p className="mt-2 text-sm text-muted">
            Faces are matched to enrolled students. Anything uncertain is flagged for you to confirm before attendance is saved.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm animate-float">
          <form
            onSubmit={submit}
            className="glass-strong rounded-panel border border-line p-7 shadow-glass-lg animate-pop"
            noValidate
          >
            <div className="mb-6 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-ctl bg-gradient-to-br from-primary to-teal-500 text-primary-ink shadow-glass">
                <ScanFace size={20} aria-hidden="true" />
              </span>
              <span className="font-serif text-xl font-bold text-ink">Face Attendance</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-ink">Sign in</h1>
            <p className="mb-5 mt-1 text-sm text-muted">Use the account issued by your institution.</p>

            <div className="space-y-4">
              <TextInput
                label="Email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <div className="relative">
                <TextInput
                  label="Password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  className="absolute bottom-2 right-2 rounded p-0.5 text-muted transition hover:text-primary"
                >
                  {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-ctl border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad animate-fade"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy}
              disabled={!email || !password}
              className="mt-5 w-full"
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
