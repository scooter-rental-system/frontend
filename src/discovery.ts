/**
 * Scooter discovery on the Home page: search, "available now" and sort, all client-side over the scooters the
 * backend returned (GET /scooters). Nothing here invents data: there are no type or location filters because the
 * Scooter entity has no such fields. Kept free of React so it can be tested alone.
 *
 * The state lives in the URL (`?q=…&available=1&sort=…`), so a filtered list can be shared or reloaded;
 * `?available=1` keeps its original meaning.
 */
import type { Scooter } from './types';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'engine-desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'engine-desc', label: 'Engine size: largest first' },
];

export interface Discovery {
  /** Free-text search on model and code. */
  q: string;
  /** Only scooters bookable right now (backend `available`). */
  available: boolean;
  sort: SortKey;
}

export const NO_FILTERS: Discovery = { q: '', available: false, sort: 'featured' };

const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** Reads the discovery state from the URL; unknown values fall back to the defaults. */
export function parseDiscovery(params: URLSearchParams): Discovery {
  const sort = params.get('sort') ?? '';
  return {
    q: params.get('q') ?? '',
    available: params.get('available') === '1',
    sort: SORT_KEYS.has(sort) ? (sort as SortKey) : 'featured',
  };
}

/** The URL parameters for a state; defaults are left out, so a clear state is a clean URL. */
export function discoveryParams(d: Discovery): Record<string, string> {
  const out: Record<string, string> = {};
  if (d.q.trim()) out.q = d.q;
  if (d.available) out.available = '1';
  if (d.sort !== 'featured') out.sort = d.sort;
  return out;
}

/** Whether anything narrows or reorders the list (sorting alone does not hide scooters). */
export const isFiltered = (d: Discovery) => d.q.trim() !== '' || d.available;

const normalize = (s: string) => s.toLocaleLowerCase('en').normalize('NFKD').replace(/\s+/g, ' ').trim();

/** Every word of the query must appear in the model or the code. */
export function matchesQuery(s: Scooter, q: string): boolean {
  const words = normalize(q).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${s.model} ${s.code}`);
  return words.every((w) => haystack.includes(w));
}

/**
 * Filters and sorts. "Featured" keeps the backend's order. Sorting is stable, and scooters without an engine size
 * go last when sorting by engine size.
 */
export function discover(scooters: readonly Scooter[], d: Discovery): Scooter[] {
  const shown = scooters.filter((s) => (!d.available || s.available) && matchesQuery(s, d.q));
  const byEngine = (s: Scooter) => (s.engineCc == null ? -Infinity : s.engineCc);
  switch (d.sort) {
    case 'price-asc':
      return shown.sort((a, b) => a.dailyRate - b.dailyRate || a.hourlyRate - b.hourlyRate || a.perKmRate - b.perKmRate);
    case 'price-desc':
      return shown.sort((a, b) => b.dailyRate - a.dailyRate || b.hourlyRate - a.hourlyRate || b.perKmRate - a.perKmRate);
    case 'engine-desc':
      return shown.sort((a, b) => byEngine(b) - byEngine(a));
    default:
      return shown;
  }
}

export type AvailabilityTone = 'green' | 'blue' | 'amber' | '';

export interface Availability {
  bookable: boolean;
  label: string;
  tone: AvailabilityTone;
}

/**
 * What the card says about availability, from the backend's `available` flag and scooter status only. When a
 * scooter is AVAILABLE but not bookable (held by another booking) no reason is guessed.
 */
export function availabilityOf(s: Pick<Scooter, 'available' | 'status'>): Availability {
  if (s.available) return { bookable: true, label: 'Available now', tone: 'green' };
  if (s.status === 'RENTED') return { bookable: false, label: 'Currently rented', tone: 'blue' };
  if (s.status === 'MAINTENANCE') return { bookable: false, label: 'In maintenance', tone: 'amber' };
  return { bookable: false, label: 'Not available now', tone: '' };
}

/** "Showing 3 of 6 scooters" / "6 scooters", for the result count. */
export function resultSummary(shown: number, total: number): string {
  const noun = (n: number) => (n === 1 ? 'scooter' : 'scooters');
  return shown === total ? `${total} ${noun(total)}` : `Showing ${shown} of ${total} ${noun(total)}`;
}
