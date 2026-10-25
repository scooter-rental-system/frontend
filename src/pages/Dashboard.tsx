import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { groupBookings, needsAction, summarize } from '../bookings';
import { BookingList } from '../components/BookingCard';
import { Empty, LoadError, Loading, StageBadge } from '../components/ui';
import { dateTime, money } from '../format';
import { cardAction, rightNow, STAGE_HELP } from '../rental';
import { bookingActionPath } from '../routes';
import type { Booking } from '../types';
import { useCustomerBookings } from '../useCustomerBookings';

const RECENT_HISTORY = 3;

const RIGHT_NOW_TITLE = {
  riding: 'Your rental is in progress',
  balance: 'A balance is due',
  pay: 'Complete your booking',
  upcoming: 'Your next rental',
} as const;

/**
 * Customer dashboard (FE-004): what needs doing right now, bookings that need attention, upcoming bookings and
 * recent history. Every figure comes from the customer's bookings (GET /api/bookings).
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useCustomerBookings();
  if (!user) return null;

  const summary = data ? summarize(data) : null;
  const groups = data ? groupBookings(data) : null;
  const now = data ? rightNow(data) : null;
  // "Needs your attention" lists the others; the one in "Right now" is not repeated.
  const attention = groups ? groups.active.filter((b) => needsAction(b) && b.id !== now?.booking?.id) : [];
  const upcoming = groups ? groups.active.filter((b) => !needsAction(b) && b.id !== now?.booking?.id) : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Hi, {user.fullName.split(' ')[0]}</h1>
        <p className="muted">Your scooter rentals at a glance.</p>
      </div>

      {loading && !data && <Loading what="Loading your bookings" />}
      {error && <LoadError error={`We couldn't load your bookings. ${error}`} onRetry={reload} />}

      {now && groups && summary && (
        <>
          <section aria-labelledby="right-now-title">
            <h2 id="right-now-title" className="section-title">
              Right now
            </h2>
            {now.booking ? (
              <RightNowCard kind={now.kind as keyof typeof RIGHT_NOW_TITLE} booking={now.booking} />
            ) : (
              <div className="right-now card">
                <div className="right-now__body">
                  <h3>No current bookings</h3>
                  <p className="muted">Pick a scooter and a start time to plan your next ride.</p>
                </div>
                <Link to="/" className="btn primary">
                  Find a scooter
                </Link>
              </div>
            )}
          </section>

          {attention.length > 0 && (
            <section aria-labelledby="attention-title">
              <h2 id="attention-title" className="section-title">
                Needs your attention <span className="pill-count">{attention.length}</span>
              </h2>
              <BookingList bookings={attention} />
            </section>
          )}

          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-title">
              <h2 id="upcoming-title" className="section-title">
                Upcoming &amp; active
              </h2>
              <BookingList bookings={upcoming} />
            </section>
          )}

          <section aria-labelledby="history-title">
            <div className="section-heading">
              <h2 id="history-title" className="section-title">
                Recent history
              </h2>
              {groups.history.length > 0 && <Link to="/bookings">View all bookings</Link>}
            </div>
            {groups.history.length === 0 ? (
              <Empty>Completed and cancelled bookings will appear here.</Empty>
            ) : (
              <BookingList bookings={groups.history.slice(0, RECENT_HISTORY)} />
            )}
          </section>

          <section className="dashboard-account" aria-labelledby="account-title">
            <div className="card stack">
              <div className="section-heading">
                <h2 id="account-title" className="section-title">
                  Your account
                </h2>
                <Link to="/profile">Edit profile</Link>
              </div>
              <div className="profile-summary">
                <strong>{user.fullName}</strong>
                <span className="muted">{user.email}</span>
                {user.phone && <span className="muted">{user.phone}</span>}
              </div>
            </div>
            <dl className="card dashboard-facts">
              <div>
                <dt>Completed rentals</dt>
                <dd className="num">{summary.completed}</dd>
              </div>
              <div>
                <dt>Spent on completed rentals</dt>
                <dd className="num">{money(summary.totalSpent)}</dd>
              </div>
              <div>
                <dt>All bookings</dt>
                <dd className="num">{summary.total}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function RightNowCard({ kind, booking: b }: { kind: keyof typeof RIGHT_NOW_TITLE; booking: Booking }) {
  const action = cardAction(b);
  return (
    <article className={`right-now card is-${kind}`} aria-labelledby="right-now-booking">
      <div className="right-now__body">
        <div className="row">
          <StageBadge stage={b.stage} status={b.status} />
          <span className="muted small">{b.reference}</span>
        </div>
        <h3 id="right-now-booking">
          {RIGHT_NOW_TITLE[kind]}: {b.scooter.model}
        </h3>
        <p className="muted">{STAGE_HELP[b.stage]}</p>
        <p className="small">
          {kind === 'riding' ? 'Started' : 'Starts'} {dateTime(b.startTime)} · {b.pickupLocation}
          {kind === 'balance' && b.payment?.balanceDue != null && <> · Balance due {money(b.payment.balanceDue)}</>}
        </p>
      </div>
      <Link to={bookingActionPath(action.target, b.id)} className="btn primary">
        {action.label}
      </Link>
    </article>
  );
}
