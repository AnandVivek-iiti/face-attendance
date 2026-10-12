import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center animate-page-in">
      <div className="glass-strong w-full max-w-md rounded-panel border border-line p-8 shadow-glass-lg animate-pop">
        <p className="font-serif text-6xl font-bold tabular-nums text-primary">404</p>
        <h1 className="mt-2 font-serif text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The address does not match any page.</p>
        <div className="mt-5 flex justify-center">
          <Button as={Link} to="/dashboard" variant="primary" size="lg">
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
