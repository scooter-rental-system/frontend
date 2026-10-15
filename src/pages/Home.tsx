import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

/**
 * Home page — landing / scooter listing placeholder.
 * Will be expanded in future issues.
 */
export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home-hero">
      <div className="home-hero__content">
        <div className="home-hero__badge">🛵 Scooter Rental System</div>
        <h1 className="home-hero__title">
          Explore the city <span className="home-hero__accent">your way</span>
        </h1>
        <p className="home-hero__subtitle">
          Affordable, easy-to-book scooter rentals. No hidden fees, no hassle.
        </p>

        {user ? (
          <div className="home-hero__actions">
            <p className="home-welcome">
              Welcome back, <strong>{user.fullName}</strong>!
            </p>
            <Link to="/bookings" className="btn-primary" id="link-my-bookings">
              My Bookings
            </Link>
          </div>
        ) : (
          <div className="home-hero__actions">
            <Link to="/register" className="btn-primary" id="link-get-started">
              Get started
            </Link>
            <Link to="/login" className="btn-secondary" id="link-sign-in">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
