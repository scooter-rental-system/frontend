import { Link, useSearchParams } from 'react-router-dom';
import { BookingList, BookingListSkeleton } from '../components/BookingCard';
import { LoadError } from '../components/ui';
import { byCategory, CATEGORY_LABEL, categoryCounts, type CategoryFilter } from '../rental';
import { useCustomerBookings } from '../useCustomerBookings';

const FILTERS: CategoryFilter[] = ['all', 'active', 'upcoming', 'past', 'cancelled'];
const FILTER_LABEL: Record<CategoryFilter, string> = { all: 'All', ...CATEGORY_LABEL };

const EMPTY: Record<CategoryFilter, string> = {
  all: 'You have no bookings yet.',
  active: 'No rental is in progress.',
  upcoming: 'You have no upcoming bookings.',
  past: 'You have no completed rentals yet.',
  cancelled: 'You have no cancelled bookings.',
};

/**
 * The customer's bookings, as the same cards and stage labels as the dashboard, filtered by what they mean to the
 * customer. The filter is kept in the URL (`?show=upcoming`).
 */
export default function MyBookings() {
  const { data, error, loading, reload } = useCustomerBookings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('show') as CategoryFilter | null;
  const filter: CategoryFilter = requested && FILTERS.includes(requested) ? requested : 'all';

  const counts = data ? categoryCounts(data) : null;
  const shown = data ? byCategory(data, filter) : [];

  return (
    <div className="page">
      <div className="page-header">
        <span className="eyebrow">Bookings</span>
        <h1>
          My <span className="accent-text">bookings</span>
        </h1>
        <p className="muted">Every booking you have made, newest activity first within each group.</p>
      </div>

      {loading && !data && <BookingListSkeleton label="Loading your bookings" />}
      {error && <LoadError error={`We couldn't load your bookings. ${error}`} onRetry={reload} />}

      {data && counts && (
        <>
          <div className="filter-tabs" role="group" aria-label="Show bookings">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`small${filter === f ? ' is-active' : ''}`}
                aria-pressed={filter === f}
                onClick={() => setParams(f === 'all' ? {} : { show: f }, { replace: true })}
              >
                {FILTER_LABEL[f]} <span className="filter-tabs__count">{counts[f]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="empty-state">
              <h2 className="section-title">{EMPTY[filter]}</h2>
              <Link to="/" className="btn primary">
                Find a scooter
              </Link>
            </div>
          ) : (
            <BookingList bookings={shown} />
          )}
        </>
      )}
    </div>
  );
}
