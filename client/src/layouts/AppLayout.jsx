import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { initials } from '../utils/format';

const navByRole = {
  [ROLES.PROFESSOR]: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/attendance/new', label: 'Take attendance', icon: Camera },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/attendance/history', label: 'Attendance history', icon: History },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  [ROLES.ADMIN]: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/attendance/history', label: 'Attendance history', icon: History },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  [ROLES.STUDENT]: [
    { to: '/dashboard', label: 'My attendance', icon: LayoutDashboard },
    { to: '/attendance/history', label: 'History', icon: History },
    { to: '/profile', label: 'Profile', icon: User },
  ],
};

function NavItems({ items, pathname, onNavigate }) {
  const navRef = useRef(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0, width: 0, visible: false });

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('a[aria-current="page"]');
    if (!active) {
      setIndicator((current) => (current.visible ? { ...current, visible: false } : current));
      return;
    }
    setIndicator({
      top: active.offsetTop,
      height: active.offsetHeight,
      width: active.offsetWidth,
      visible: true,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, pathname, items]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <nav ref={navRef} aria-label="Main" className="relative flex flex-col gap-0.5">
      <span
        aria-hidden="true"
        className="nav-indicator"
        data-visible={indicator.visible}
        style={{ top: indicator.top, height: indicator.height, width: indicator.width }}
      />
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `relative z-10 flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
              isActive ? 'text-primary' : 'text-ink hover:text-primary'
            }`
          }
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ items, user, onSignOut, onNavigate, pathname }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-ctl bg-gradient-to-br from-primary to-teal-500 text-primary-ink shadow-glass">
          <ScanFace size={18} aria-hidden="true" />
        </span>
        <span className="font-serif text-lg font-bold text-ink">Face Attendance</span>
      </div>
      <div className="flex-1 px-3">
        <NavItems items={items} pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
            {initials(user.name) || '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
            <p className="text-xs capitalize text-muted">{user.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-ctl px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white/10 hover:text-primary"
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const items = navByRole[user.role] ?? navByRole[ROLES.STUDENT];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-white/[0.04] backdrop-blur-glass lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar items={items} user={user} onSignOut={signOut} pathname={location.pathname} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/[0.06] px-4 py-3 backdrop-blur-glass lg:hidden">
        <span className="font-serif text-lg font-bold text-ink">Face Attendance</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded p-1 text-ink transition hover:bg-white/10"
        >
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-scrim/75 backdrop-blur-sm animate-fade"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="glass-strong absolute inset-y-0 left-0 w-64 border-r border-line animate-drawer">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-3 z-10 rounded p-1 text-muted transition hover:bg-white/10 hover:text-ink"
            >
              <X size={18} />
            </button>
            <Sidebar
              items={items}
              user={user}
              onSignOut={signOut}
              onNavigate={() => setOpen(false)}
              pathname={location.pathname}
            />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div key={location.pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
