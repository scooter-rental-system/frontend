import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { type Theme, useTheme } from '../theme';
import { activeAdminLink, ADMIN_NAV, initials } from '../admin';
import { humanize } from '../format';
import { isAdmin } from '../types';
import { NotificationBell } from './NotificationBell';
import { AdminIcon } from './AdminIcon';
import { BrandMark } from './ui';
import { DemoBanner } from './DemoMode';

const BRAND_NAME = 'Scooter Rent Kandy';

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

/**
 * Below 900px the navigation and account controls collapse behind a menu button (a disclosure: the button's
 * aria-expanded shows the state; Escape closes it and returns focus to the button; navigating closes it).
 * On wider screens the same elements are shown inline and the button is hidden.
 */
function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return { open, setOpen, buttonRef };
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const menu = useMobileMenu();
  // The customer pages are guarded to customers (RequireAuth customer); staff are not offered them.
  const customer = user?.role === 'USER';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-name">{BRAND_NAME}</span>
          </Link>

          <div id="site-menu" className={`site-menu${menu.open ? ' is-open' : ''}`}>
            <nav className="nav" aria-label="Main">
              <NavLink to="/" end>Scooters</NavLink>
              {customer && <NavLink to="/dashboard">Dashboard</NavLink>}
              {customer && <NavLink to="/bookings">My Bookings</NavLink>}
              {isAdmin(user?.role) && <NavLink to="/admin">Admin</NavLink>}
            </nav>

            <div className="account">
              {user ? (
                <>
                  {customer ? (
                    <NavLink to="/profile" className="account-name" title="Your profile">
                      {user.fullName}
                    </NavLink>
                  ) : (
                    <span className="account-name">{user.fullName}</span>
                  )}
                  <button
                    className="small on-ink"
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
                  <Link to="/login" className="btn small on-ink" id="link-login">
                    Log in
                  </Link>
                  <Link to="/register" className="btn small primary" id="link-register">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="topbar-right">
            {user && <NotificationBell />}
            <ThemeToggle />
            <button
              ref={menu.buttonRef}
              type="button"
              className="menu-toggle"
              aria-expanded={menu.open}
              aria-controls="site-menu"
              aria-label="Menu"
              onClick={() => menu.setOpen((v) => !v)}
            >
              <span className="menu-toggle__bars" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <DemoBanner />
      <main id="main" className="container" tabIndex={-1}>
        <Outlet />
      </main>

      <SiteFooter customer={customer} admin={isAdmin(user?.role)} signedIn={!!user} />
    </>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

/** Only links to pages that exist, offered to the roles that can open them. */
function SiteFooter({ customer, admin, signedIn }: { customer: boolean; admin: boolean; signedIn: boolean }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <Link to="/" className="brand">
            <BrandMark />
            <span>{BRAND_NAME}</span>
          </Link>
          <p>Scooter and camping-gear rental in Kandy, Sri Lanka.</p>
        </div>
        <nav aria-label="Footer">
          <ul>
            <li>
              <Link to="/">Scooters</Link>
            </li>
            {customer && (
              <li>
                <Link to="/bookings">My Bookings</Link>
              </li>
            )}
            {customer && (
              <li>
                <Link to="/profile">Profile</Link>
              </li>
            )}
            {admin && (
              <li>
                <Link to="/admin">Admin</Link>
              </li>
            )}
            {!signedIn && (
              <li>
                <Link to="/login">Log in</Link>
              </li>
            )}
            {!signedIn && (
              <li>
                <Link to="/register">Create an account</Link>
              </li>
            )}
          </ul>
        </nav>
        <p className="site-footer__legal">
          © {new Date().getFullYear()} {BRAND_NAME}. Card payments are processed securely by Stripe.
        </p>
      </div>
    </footer>
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

/**
 * The admin console (Figma admin screens): a charcoal sidebar with grouped navigation, a compact top bar and the
 * page. It is its own shell, without the public header and footer. Below 900px the sidebar becomes a drawer behind
 * the "Admin menu" button (a disclosure: aria-expanded; Escape, the backdrop or navigating closes it and focus
 * returns to the button). A closed drawer is hidden, so its links are out of the tab order.
 */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const current = activeAdminLink(location.pathname);

  useEffect(() => setOpen(false), [location.pathname]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="admin-app">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <nav id="admin-nav" className={`sidebar${open ? ' is-open' : ''}`} aria-label="Admin sections">
        <Link to="/admin" className="sidebar__brand">
          <span className="sidebar__brand-name">{BRAND_NAME}</span>
          <span className="sidebar__brand-sub">Admin console</span>
        </Link>
        <div className="sidebar__groups">
          {ADMIN_NAV.map((group) => (
            <div key={group.title} className="sidebar__group">
              <h2 className="sidebar__group-title">{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} end={link.to === '/admin'}>
                      <AdminIcon name={link.icon} />
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="sidebar__footer">
          {/* Opens the real Add scooter form on the Scooters page. */}
          <Link to="/admin/fleet" state={{ addScooter: true }} className="btn primary sidebar__cta">
            <AdminIcon name="plus" />
            Add scooter
          </Link>
          {user && (
            <div className="sidebar__user">
              <span className="sidebar__avatar" aria-hidden>
                {initials(user.fullName)}
              </span>
              <span className="sidebar__user-text">
                <span className="sidebar__user-name">{user.fullName}</span>
                <span className="sidebar__user-role">{humanize(user.role)}</span>
              </span>
            </div>
          )}
          <Link to="/" className="sidebar__exit">
            <AdminIcon name="back" />
            Back to the website
          </Link>
        </div>
      </nav>
      {open && <div className="sidebar-backdrop" aria-hidden onClick={close} />}

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            ref={buttonRef}
            type="button"
            className="menu-toggle admin-menu-toggle"
            aria-expanded={open}
            aria-controls="admin-nav"
            aria-label="Admin menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="menu-toggle__bars" aria-hidden />
          </button>
          <span className="admin-topbar__context">
            <span className="admin-topbar__eyebrow">Admin</span>
            <span className="admin-topbar__title">{current?.label ?? 'Admin'}</span>
          </span>
          <div className="admin-topbar__actions">
            {user && <NotificationBell />}
            <ThemeToggle />
            <button
              className="small on-ink"
              id="btn-admin-logout"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </div>
        </header>
        <DemoBanner />
        <main id="main" className="admin-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
