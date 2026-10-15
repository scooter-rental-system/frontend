import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { isAdmin } from '../types';

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
            <NavLink to="/" end>Home</NavLink>
            {user?.role === 'USER' && (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/bookings">My Bookings</NavLink>
                <NavLink to="/profile">Profile</NavLink>
              </>
            )}
            {isAdmin(user?.role) && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <div className="topbar-right">
            {user ? (
              <>
                <span className="muted small">{user.fullName}</span>
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
