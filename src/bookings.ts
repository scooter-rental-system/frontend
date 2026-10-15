// Pure booking helpers for the customer dashboard. Kept free of runtime imports so
// `npm test` can run them directly with Node's type stripping.
import type { Booking, BookingStage } from './types';

/** Bookings that still hold a scooter: unpaid, upcoming, riding or awaiting the final balance. */
export const isActiveReservation = (b: Booking) => b.status === 'PENDING' || b.status === 'ACTIVE';

/** Stages that need the customer to do something (pay, retry payment, settle the balance). */
const NEEDS_ACTION: BookingStage[] = ['AWAITING_PAYMENT', 'PAYMENT_FAILED', 'BALANCE_DUE'];
export const needsAction = (b: Booking) => NEEDS_ACTION.includes(b.stage);

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * Keeps only the signed-in customer's bookings. The backend must already scope
 * GET /api/bookings to the caller; this is a guard against showing anything else.
 */
export function ownBookings(bookings: Booking[], customerId: string): Booking[] {
  return bookings.filter((b) => b.customer?.id === customerId);
}

export interface BookingGroups {
  /** In progress, upcoming or awaiting payment, soonest start first. */
  active: Booking[];
  /** Completed and cancelled, most recent first. */
  history: Booking[];
}

export function groupBookings(bookings: Booking[]): BookingGroups {
  const active = bookings.filter(isActiveReservation).sort((a, b) => time(a.startTime) - time(b.startTime));
  const history = bookings
    .filter((b) => !isActiveReservation(b))
    .sort((a, b) => time(b.endTime ?? b.cancelledAt ?? b.startTime) - time(a.endTime ?? a.cancelledAt ?? a.startTime));
  return { active, history };
}

export interface BookingSummary {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  needsAction: number;
  /** Sum of final totals for completed rentals. */
  totalSpent: number;
}

export function summarize(bookings: Booking[]): BookingSummary {
  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let actionCount = 0;
  let totalSpent = 0;
  for (const b of bookings) {
    if (isActiveReservation(b)) active++;
    if (b.status === 'COMPLETED') {
      completed++;
      totalSpent += b.totalCost ?? 0;
    }
    if (b.status === 'CANCELLED') cancelled++;
    if (needsAction(b)) actionCount++;
  }
  return { total: bookings.length, active, completed, cancelled, needsAction: actionCount, totalSpent };
}

export type HistoryFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export function filterBookings(bookings: Booking[], filter: HistoryFilter): Booking[] {
  switch (filter) {
    case 'ACTIVE':
      return bookings.filter(isActiveReservation);
    case 'COMPLETED':
      return bookings.filter((b) => b.status === 'COMPLETED');
    case 'CANCELLED':
      return bookings.filter((b) => b.status === 'CANCELLED');
    default:
      return bookings;
  }
}

/** Customer-facing wording for each server-derived stage. */
export const STAGE_LABEL: Record<BookingStage, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In progress',
  BALANCE_DUE: 'Balance due',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};
