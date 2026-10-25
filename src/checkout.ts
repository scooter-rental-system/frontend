/**
 * Presentation helpers for the booking journey (Scooter → Details → Agreement → Payment → Confirmed). They only
 * describe state the backend already returned; nothing here prices, books or pays. Kept free of React so they can
 * be tested alone.
 */
import type { PaymentStatus, Quote } from './types';

export const BOOKING_STEPS = ['Details', 'Agreement', 'Payment', 'Confirmed'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type StepState = 'done' | 'current' | 'upcoming';

/** Each step's state for the current step (0-based). */
export function stepStates(current: number): { label: BookingStep; state: StepState }[] {
  return BOOKING_STEPS.map((label, i) => ({
    label,
    state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }));
}

/**
 * Checkout's current step, from the contract the backend returned: the agreement first, payment once it is
 * signed (the backend refuses a payment intent for an unsigned contract either way).
 */
export const checkoutStep = (contractSigned: boolean) => (contractSigned ? 2 : 1);

/** What happened to a payment, in words, from its real status. Only SUCCESS means money was taken. */
export function paymentLabel(status: PaymentStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'Charged';
    case 'REFUNDED':
      return 'Refunded';
    case 'FAILED':
      return 'Payment failed';
    case 'PENDING':
      return 'Payment pending';
  }
}

/** A gear quantity within 0…max (the stock the backend reported). Anything that is not a number counts as 0. */
export function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(value)));
}

export interface SummaryLine {
  label: string;
  detail?: string;
  amount: number;
}

/**
 * The booking summary, using the backend quote's values as they are (no frontend arithmetic): the scooter's first
 * hour, each gear line as quoted, and the amount charged now.
 */
export function quoteLines(quote: Quote): { lines: SummaryLine[]; payNow: number } {
  const lines: SummaryLine[] = [{ label: 'Scooter', detail: 'First hour', amount: quote.hourlyRate }];
  for (const g of quote.gear) {
    lines.push({ label: `${g.name} × ${g.quantity}`, detail: g.days === 1 ? 'First day' : `${g.days} days`, amount: g.lineTotal });
  }
  return { lines, payNow: quote.initialCharge };
}
