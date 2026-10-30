/**
 * Presentation helpers for the customer's bookings after checkout: the dashboard's "Right now" card, My Bookings
 * filters, the booking timeline and the live-rental status. Everything is derived from the server's booking stage
 * and the data it returned; no booking state is computed here. Kept free of React so it can be tested alone.
 */
import type { Booking, BookingStage } from './types';

/**
 * SDS 4.3: the speed the backend treats as a violation (GpsService.SPEED_LIMIT_KMH, 60 km/h). PRESENTATION ONLY:
 * it decides whether the rider sees an "over the limit" note. The frontend enforces nothing; the backend alone
 * detects and records speed violations.
 */
export const SPEED_LIMIT_KMH = 60;

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const soonestFirst = (a: Booking, b: Booking) => time(a.startTime) - time(b.startTime);

// ─── Right now ───────────────────────────────────────────────────────────────

export type RightNowKind = 'riding' | 'balance' | 'pay' | 'upcoming' | 'none';

export interface RightNow {
  kind: RightNowKind;
  booking: Booking | null;
}

/**
 * The one booking the customer most needs right now, by stage: a rental in progress, then a balance to settle,
 * then a booking waiting for payment, then the next upcoming one. Ties go to the soonest start.
 */
export function rightNow(bookings: readonly Booking[]): RightNow {
  const pick = (stages: BookingStage[]) => bookings.filter((b) => stages.includes(b.stage)).sort(soonestFirst)[0];
  const order: [RightNowKind, BookingStage[]][] = [
    ['riding', ['IN_PROGRESS']],
    ['balance', ['BALANCE_DUE']],
    ['pay', ['AWAITING_PAYMENT', 'PAYMENT_FAILED']],
    ['upcoming', ['UPCOMING']],
  ];
  for (const [kind, stages] of order) {
    const booking = pick(stages);
    if (booking) return { kind, booking };
  }
  return { kind: 'none', booking: null };
}

export interface CardAction {
  /** Where it leads: the booking's checkout, or its booking page (paths from routes.ts). */
  target: 'checkout' | 'booking';
  label: string;
  primary: boolean;
}

/**
 * A booking's next step for the customer. Unpaid bookings (PENDING) continue at checkout, as before; everything
 * else opens the booking page.
 */
export function cardAction(b: Pick<Booking, 'stage' | 'status'>): CardAction {
  if (b.status === 'PENDING') {
    return { target: 'checkout', label: b.stage === 'PAYMENT_FAILED' ? 'Try payment again' : 'Complete payment', primary: true };
  }
  if (b.stage === 'BALANCE_DUE') return { target: 'booking', label: 'Settle balance', primary: true };
  if (b.stage === 'IN_PROGRESS') return { target: 'booking', label: 'Track your ride', primary: true };
  return { target: 'booking', label: 'View booking', primary: false };
}

// ─── My Bookings filters ─────────────────────────────────────────────────────

export type BookingCategory = 'active' | 'upcoming' | 'past' | 'cancelled';

export const CATEGORY_LABEL: Record<BookingCategory, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Past',
  cancelled: 'Cancelled',
};

const CATEGORY_OF: Record<BookingStage, BookingCategory> = {
  IN_PROGRESS: 'active',
  BALANCE_DUE: 'active',
  AWAITING_PAYMENT: 'upcoming',
  PAYMENT_FAILED: 'upcoming',
  UPCOMING: 'upcoming',
  COMPLETED: 'past',
  CANCELLED: 'cancelled',
  REFUNDED: 'cancelled',
};

export const categoryOf = (b: Booking): BookingCategory => CATEGORY_OF[b.stage];

export type CategoryFilter = BookingCategory | 'all';

/** Bookings in a category: active and upcoming soonest first, past and cancelled most recent first. */
export function byCategory(bookings: readonly Booking[], filter: CategoryFilter): Booking[] {
  const shown = bookings.filter((b) => filter === 'all' || categoryOf(b) === filter);
  const recent = (b: Booking) => time(b.endTime ?? b.endedAt ?? b.cancelledAt ?? b.startTime);
  return shown.sort((a, b) => {
    const ca = categoryOf(a);
    const cb = categoryOf(b);
    const rank: Record<BookingCategory, number> = { active: 0, upcoming: 1, past: 2, cancelled: 3 };
    if (ca !== cb) return rank[ca] - rank[cb];
    return ca === 'active' || ca === 'upcoming' ? soonestFirst(a, b) : recent(b) - recent(a);
  });
}

export function categoryCounts(bookings: readonly Booking[]): Record<CategoryFilter, number> {
  const counts: Record<CategoryFilter, number> = { all: bookings.length, active: 0, upcoming: 0, past: 0, cancelled: 0 };
  for (const b of bookings) counts[categoryOf(b)]++;
  return counts;
}

// ─── Booking timeline ────────────────────────────────────────────────────────

export type TimelineState = 'done' | 'current' | 'upcoming' | 'stopped';

export interface TimelineStep {
  label: string;
  state: TimelineState;
}

/**
 * Reserved → Paid → In progress → Completed, from the server stage: [steps done, whether the next step is under
 * way]. Awaiting payment is at "Paid"; a paid booking that has not started has no step under way; a balance due is
 * at "Completed". A cancelled booking ends at "Cancelled".
 */
const PROGRESS: Record<Exclude<BookingStage, 'CANCELLED' | 'REFUNDED'>, [number, boolean]> = {
  AWAITING_PAYMENT: [1, true],
  PAYMENT_FAILED: [1, true],
  UPCOMING: [2, false],
  IN_PROGRESS: [2, true],
  BALANCE_DUE: [3, true],
  COMPLETED: [4, false],
};

export function timeline(stage: BookingStage): TimelineStep[] {
  if (stage === 'CANCELLED' || stage === 'REFUNDED') {
    return [
      { label: 'Reserved', state: 'done' },
      { label: stage === 'REFUNDED' ? 'Cancelled · refunded' : 'Cancelled', state: 'stopped' },
    ];
  }
  const [done, underWay] = PROGRESS[stage];
  return ['Reserved', 'Paid', 'In progress', 'Completed'].map((label, i) => ({
    label,
    state: i < done ? 'done' : i === done && underWay ? 'current' : 'upcoming',
  }));
}

/** One sentence on what the stage means for the customer, using only rules the app already states. */
export const STAGE_HELP: Record<BookingStage, string> = {
  AWAITING_PAYMENT: 'Sign the rental agreement and pay to confirm it. Unpaid reservations are released after 30 minutes.',
  PAYMENT_FAILED: 'The last payment did not go through. Try again to keep this booking.',
  UPCOMING: 'Paid and confirmed. You can cancel for a full refund until the rental starts.',
  IN_PROGRESS: 'Your rental is running. End it in the app when you return the scooter.',
  BALANCE_DUE: 'The rental has ended, but the final payment has not been settled yet.',
  COMPLETED: 'This rental is complete. Thank you for riding with us.',
  CANCELLED: 'This booking was cancelled.',
  REFUNDED: 'This booking was cancelled and the payment refunded.',
};

// ─── Live rental ─────────────────────────────────────────────────────────────

export interface LiveState {
  label: string;
  tone: 'green' | 'amber' | '';
}

/** Whether the scooter's position is live, the last known one, or not known yet (the backend's `stale` flag). */
export function liveState(position: { stale: boolean; lastSeen: string | null } | null | undefined): LiveState {
  if (!position || !position.lastSeen) return { label: 'No location yet', tone: '' };
  return position.stale ? { label: 'Last known position', tone: 'amber' } : { label: 'Live', tone: 'green' };
}

export interface SpeedState {
  text: string;
  over: boolean;
}

/** The latest reported speed, with a text warning above the limit. No speed is shown for a stale position. */
export function speedState(speedKmh: number | null | undefined, stale: boolean): SpeedState {
  if (stale || speedKmh == null) return { text: '—', over: false };
  const kmh = Math.round(speedKmh);
  return { text: `${kmh} km/h`, over: speedKmh > SPEED_LIMIT_KMH };
}
