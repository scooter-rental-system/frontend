import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { type Theme, useTheme } from '../theme';
import { isAdmin } from '../types';
import { NotificationBell } from './NotificationBell';

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

/**
 * A disclosure: the button shows or hides three ordinary buttons (Tab moves between them, the chosen one is
 * aria-pressed). Escape or a click outside closes it.
 */
function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const icon = resolved === 'dark' ? '🌙' : '☀️';
  const current = THEME_OPTIONS.find((opt) => opt.value === theme)?.label ?? theme;

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        id="btn-theme-toggle"
        className="theme-toggle"
        aria-label={`Colour theme: ${current}`}
        aria-expanded={open}
        aria-controls="theme-options"
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${current}`}
      >
        <span aria-hidden>{icon}</span>
      </button>

      {open && (
        <div id="theme-options" className="theme-menu" role="group" aria-label="Colour theme">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              aria-pressed={theme === opt.value}
              className={theme === opt.value ? 'is-active' : ''}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              <span aria-hidden>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The customer pages are guarded to customers (RequireAuth customer); staff are not offered them.
  const customer = user?.role === 'USER';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span aria-hidden>🛵</span> Scooter Rental System
          </Link>

          <nav className="nav">
            <NavLink to="/" end>Scooters</NavLink>
            {customer && <NavLink to="/dashboard">Dashboard</NavLink>}
            {customer && <NavLink to="/bookings">My Bookings</NavLink>}
            {isAdmin(user?.role) && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <div className="topbar-right">
            {user && <NotificationBell />}
            <ThemeToggle />
            {user ? (
              <>
                {customer ? (
                  <NavLink to="/profile" className="muted small">
                    {user.fullName}
                  </NavLink>
                ) : (
                  <span className="muted small">{user.fullName}</span>
                )}
                <button
                  className="small"
                  id="btn-logout"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn small" id="link-login">
                  Log in
                </Link>
                <Link to="/register" className="btn small primary" id="link-register">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </>
  );
}

// ─── RequireAuth ──────────────────────────────────────────────────────────────

/**
 * Redirects unauthenticated users to /login (with return path in state).
 * If `admin` is true, also redirects non-admin users to /.
 * If `customer` is true, also redirects staff (non-USER) accounts to /.
 * This is a UX guard only: the backend must authorize every request.
 */
export function RequireAuth({
  admin,
  customer,
  children,
}: {
  admin?: boolean;
  customer?: boolean;
  children: JSX.Element;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted">Loading…</p>;

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (admin && !isAdmin(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (customer && user.role !== 'USER') {
    return <Navigate to="/" replace />;
  }

  return children;
}

const ADMIN_LINKS = [
  ['/admin', 'Dashboard'],
  ['/admin/bookings', 'Bookings'],
  ['/admin/fleet', 'Fleet'],
  ['/admin/gps', 'Live GPS'],
  ['/admin/maintenance', 'Maintenance'],
  ['/admin/gear', 'Camping gear'],
  ['/admin/billing', 'Payments & billing'],
  ['/admin/customers', 'Customers'],
  ['/admin/notifications', 'Notifications'],
  ['/admin/reports', 'Reports'],
] as const;

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        {ADMIN_LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            {label}
          </NavLink>
        ))}
      </aside>
      <section>
        <Outlet />
      </section>
    </div>
  );
}

