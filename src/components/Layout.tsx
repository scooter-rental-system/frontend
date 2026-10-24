import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { type Theme, useTheme } from '../theme';
import { isAdmin } from '../types';

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown when user clicks outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const icon = resolved === 'dark' ? '🌙' : '☀️';

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        id="btn-theme-toggle"
        className="theme-toggle"
        aria-label="Toggle colour theme"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${theme}`}
      >
        {icon}
      </button>

      {open && (
        <div className="theme-menu" role="menu">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="menuitem"
              className={theme === opt.value ? 'is-active' : ''}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
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

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span aria-hidden>🛵</span> Scooter Rental System
          </Link>

          <nav className="nav">
            <NavLink to="/" end>Scooters</NavLink>
            {user && <NavLink to="/bookings">My Bookings</NavLink>}
            {isAdmin(user?.role) && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <div className="topbar-right">
            <ThemeToggle />
            {user ? (
              <>
                <NavLink to="/profile" className="muted small">
                  {user.fullName}
                </NavLink>
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

