import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { groupBookings, summarize } from '../bookings';
import { BookingList } from '../components/BookingCard';
import { Empty, LoadError, Loading, Stat } from '../components/ui';
import { money } from '../format';
import { useCustomerBookings } from '../useCustomerBookings';

const RECENT_HISTORY = 3;

/**
 * Customer dashboard (FE-004): rental summary, active reservations,
 * recent booking history and a profile summary.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useCustomerBookings();
  if (!user) return null;

  const summary = data ? summarize(data) : null;
  const groups = data ? groupBookings(data) : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Hi, {user.fullName.split(' ')[0]}</h1>
        <p className="muted">Here&apos;s an overview of your scooter rentals.</p>
      </div>

      {loading && !data && <Loading what="Loading your bookings" />}
      {error && <LoadError error={`We couldn't load your bookings. ${error}`} onRetry={reload} />}

      {summary && groups && (
        <>
          <section className="stat-grid" aria-label="Rental summary">
            <Stat
              label="Active reservations"
              value={summary.active}
              hint={summary.needsAction ? `${summary.needsAction} need action` : undefined}
            />
            <Stat label="Completed rentals" value={summary.completed} />
            <Stat label="Cancelled" value={summary.cancelled} />
            <Stat label="Spent on rentals" value={money(summary.totalSpent)} hint="Final totals of completed rentals" />
          </section>

          <section>
            <h2 className="section-title">Active reservations</h2>
            {groups.active.length === 0 ? (
              <Empty>You have no active or upcoming reservations.</Empty>
            ) : (
              <BookingList bookings={groups.active} />
            )}
          </section>

          <section>
            <div className="section-heading">
              <h2 className="section-title">Recent history</h2>
              {groups.history.length > 0 && <Link to="/bookings">View all bookings</Link>}
            </div>
            {groups.history.length === 0 ? (
              <Empty>Completed and cancelled bookings will appear here.</Empty>
            ) : (
              <BookingList bookings={groups.history.slice(0, RECENT_HISTORY)} />
            )}
          </section>
        </>
      )}

      <section>
        <div className="section-heading">
          <h2 className="section-title">Profile</h2>
          <Link to="/profile">View profile</Link>
        </div>
        <div className="card profile-summary">
          <strong>{user.fullName}</strong>
          <span className="muted">{user.email}</span>
          {user.phone && <span className="muted">{user.phone}</span>}
        </div>
      </section>
    </div>
  );
}
