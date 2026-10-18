import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { isProfileComplete } from '../utils/normalize';
import {
  BookOpen,
  CalendarDays,
  Camera,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import { initials } from '../utils/format';

const navByRole = {
  [ROLES.PROFESSOR]: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/attendance/new', label: 'Take attendance', icon: Camera },
    { to: '/professor/requests', label: 'Requests', icon: UserPlus },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/attendance/history', label: 'Attendance history', icon: History },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  [ROLES.ADMIN]: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/courses', label: 'Professors', icon: BookOpen },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/students', label: 'Students', icon: Users },
    { to: '/attendance/history', label: 'Attendance history', icon: History },
    { to: '/profile', label: 'Profile', icon: User },
  ],
  [ROLES.STUDENT]: [
    { to: '/student/attendance', label: 'My attendance', icon: LayoutDashboard },
    { to: '/student/profile', label: 'My profile', icon: User },
  ],
};

const dateFormatter = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

// Longest nav path that prefixes the current URL names the current page.
function pageLabel(items, pathname) {
  let best = null;
  items.forEach((item) => {
    const match = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (match && (!best || item.to.length > best.to.length)) best = item;
  });
  if (best) return best.label;
  return pathname.includes('/review') ? 'Review attendance' : 'Workspace';
}

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
    <nav ref={navRef} aria-label="Main" className="relative flex flex-col gap-1">
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
            `group relative z-10 flex items-center gap-3 rounded-ctl px-3.5 py-2.5 text-sm font-semibold transition-colors duration-200 ${
              isActive ? 'text-primary' : 'text-muted hover:text-ink'
            }`
          }
        >
          <Icon
            size={17}
            aria-hidden="true"
            className="transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5 group-hover:scale-115"
          />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ items, user, onSignOut, onNavigate, pathname }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-panel">
          <ScanFace size={24} aria-hidden="true" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-serif text-base font-extrabold tracking-tight text-ink">Face Attendance</span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Classroom recognition</span>
        </span>
      </div>
      <p className="px-6 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Menu</p>
      <div className="flex-1 overflow-y-auto px-3">
        <NavItems items={items} pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="space-y-3 border-t border-line p-4">
        <div className="flex items-center gap-3 rounded-panel border border-line bg-white/[0.04] p-2.5">
          <span className="avatar-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary">
            {initials(user.name) || '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
            <p className="text-xs capitalize text-muted">{user.role}</p>
          </div>
        </div>
        <ThemeSwitcher />
        <button
          type="button"
          onClick={onSignOut}
          className="group flex w-full items-center gap-2 rounded-ctl px-3 py-2 text-sm font-semibold text-muted transition-colors duration-200 hover:bg-white/10 hover:text-ink active:scale-[0.97]"
        >
          <LogOut
            size={16}
            aria-hidden="true"
            className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5"
          />
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

  // Students with no saved profile details cannot skip setup: every route except the setup page itself bounces them back to it.
  if (!isProfileComplete(user) && location.pathname !== '/student/profile') {
    return <Navigate to="/student/profile" replace />;
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sidebar hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar items={items} user={user} onSignOut={signOut} pathname={location.pathname} />
        </div>
        <span aria-hidden="true" className="sidebar-edge" />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="app-header sticky top-0 z-30 hidden items-center justify-between gap-4 px-10 py-3 lg:flex">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <span>Face Attendance</span>
            <span aria-hidden="true" className="text-primary">›</span>
            <span className="text-ink">{pageLabel(items, location.pathname)}</span>
          </p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-muted">
              <CalendarDays size={14} aria-hidden="true" className="text-primary" />
              {dateFormatter.format(new Date())}
            </span>
            <ThemeSwitcher compact />
          </div>
        </header>

        <header className="app-header sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
          <span className="flex items-center gap-2.5">
            <span className="brand-mark flex h-8 w-8 items-center justify-center rounded-ctl">
              <ScanFace size={18} aria-hidden="true" />
            </span>
            <span className="font-serif text-base font-extrabold tracking-tight text-ink">Face Attendance</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded p-1.5 text-ink transition hover:bg-white/10 active:scale-90"
          >
            <Menu size={22} />
          </button>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-scrim/75 animate-fade"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="glass-strong sidebar absolute inset-y-0 left-0 w-72 border-r border-line animate-drawer">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="absolute right-2 top-3 z-10 rounded p-1 text-muted transition hover:rotate-90 hover:bg-white/10 hover:text-ink"
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

        <main className="mx-auto w-full max-w-[1400px] px-4 py-8 lg:px-10 lg:py-10">
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
