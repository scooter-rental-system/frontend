import { useState } from 'react';
import { filterBookings, groupBookings, type HistoryFilter } from '../bookings';
import { BookingList } from '../components/BookingCard';
import { Empty, LoadError, Loading } from '../components/ui';
import { useCustomerBookings } from '../useCustomerBookings';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'ALL',       label: 'All' },
  { value: 'ACTIVE',    label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const EMPTY_MESSAGE: Record<HistoryFilter, string> = {
  ALL:       "You haven't made any bookings yet.",
  ACTIVE:    'You have no active or upcoming reservations.',
  COMPLETED: 'You have no completed rentals yet.',
  CANCELLED: 'You have no cancelled bookings.',
};

/** Booking history (FE-004): every booking of the signed-in customer, filterable by status. */
export default function MyBookings() {
  const { data, error, loading, reload } = useCustomerBookings();
  const [filter, setFilter] = useState<HistoryFilter>('ALL');

  // Active reservations first (soonest start), then history (most recent first).
  const shown = data
    ? (() => {
        const { active, history } = groupBookings(data);
        return filterBookings([...active, ...history], filter);
      })()
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>My bookings</h1>
        <p className="muted">Every booking you&apos;ve made, with its current status.</p>
      </div>

      <div className="filter-tabs" role="group" aria-label="Filter bookings">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`small ${filter === f.value ? 'is-active' : ''}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data && <Loading what="Loading your bookings" />}
      {error && <LoadError error={`We couldn't load your bookings. ${error}`} onRetry={reload} />}
      {shown && (shown.length === 0 ? <Empty>{EMPTY_MESSAGE[filter]}</Empty> : <BookingList bookings={shown} />)}
    </div>
  );
}
