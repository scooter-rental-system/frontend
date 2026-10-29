/**
 * Cash at the rental counter (backend BE-044). The customer only chooses cash; the money counts as received only when
 * an admin records it, and cash handed back only when an admin records that too. Nothing here marks anything paid:
 * these helpers describe the state the backend returned and pick the one admin confirmation that applies. Kept free
 * of React so they can be tested alone.
 */
import type { Booking, Invoice, PaymentStatus } from './types';

// Same formatting as format.ts money(); a local copy because Node's test runner loads this file without a bundler.
const lkr = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const money = (n: number) => lkr.format(n);

export type CheckoutMethod = 'CARD' | 'CASH';

export const METHOD_LABEL: Record<CheckoutMethod, string> = {
  CARD: 'Card / Online Payment',
  CASH: 'Cash',
};

export const CASH_CHECKOUT_NOTE =
  'Pay in cash at the rental counter. Your booking will be confirmed after an administrator records the payment.';

/** The 30-minute release of unpaid bookings applies to cash too, so the customer is told plainly. */
export const CASH_HOLD_NOTE =
  'Unpaid bookings are released 30 minutes after they are made, so please bring the cash to the counter within that time.';

export const CASH_PENDING_NOTE =
  'Waiting for your cash payment at the rental counter. Your booking is confirmed once an administrator records it.';

export const CASH_END_NOTE =
  'The final total is calculated. Pay any remaining balance in cash at the rental counter; if you paid more than the final total, the difference is handed back to you there.';

export const CASH_CANCEL_NOTE = 'Cancel this booking? The cash you paid is handed back to you at the rental counter.';

export const isCashBooking = (b: Pick<Booking, 'payment'>) => b.payment?.method === 'CASH';

/** What happened to a cash payment, in words. Only an admin's record makes it received or refunded. */
export function cashPaymentLabel(status: PaymentStatus): string {
  switch (status) {
    case 'SUCCESS':
      return 'Cash received';
    case 'REFUNDED':
      return 'Cash refunded';
    case 'FAILED':
      return 'Cash not received';
    case 'PENDING':
      return 'Cash payment pending';
  }
}

export type CashStep = 'initial' | 'balance' | 'refund';

export interface CashAction {
  step: CashStep;
  amount: number;
  /** What the amount is, e.g. "Cash due now". */
  dueLabel: string;
  /** The button. */
  label: string;
  title: string;
  message: string;
}

/**
 * The admin confirmation this cash booking is waiting for, if any: the initial cash, the final cash balance, or
 * cash to hand back. Never offered to a customer, and never for a card payment.
 */
export function cashAction(b: Booking, admin: boolean): CashAction | null {
  const p = b.payment;
  if (!admin || !p || p.method !== 'CASH') return null;
  if (b.status === 'PENDING' && p.status === 'PENDING' && b.contractSigned) {
    return {
      step: 'initial',
      amount: p.amount,
      dueLabel: 'Cash due now',
      label: 'Confirm cash received',
      title: 'Confirm cash received?',
      message: `Confirm only after you have received ${money(p.amount)} in cash from ${b.customer.fullName}. The booking becomes active and the scooter is marked rented.`,
    };
  }
  if (b.status === 'ACTIVE' && b.endedAt && p.balanceDue != null) {
    return {
      step: 'balance',
      amount: p.balanceDue,
      dueLabel: 'Cash balance due',
      label: 'Confirm final cash received',
      title: 'Confirm final cash received?',
      message: `Confirm only after you have received the remaining ${money(p.balanceDue)} in cash. The rental is then completed.`,
    };
  }
  if (p.refundDue != null) {
    return {
      step: 'refund',
      amount: p.refundDue,
      dueLabel: 'Cash refund due',
      label: 'Confirm cash refund given',
      title: 'Confirm cash refund given?',
      message: `Confirm only after you have handed ${money(p.refundDue)} in cash back to ${b.customer.fullName}.`,
    };
  }
  return null;
}

export const cashConfirmPath = (bookingId: string, step: CashStep) =>
  `/admin/bookings/${encodeURIComponent(bookingId)}/cash/${step}`;

export const chooseCashPath = (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}/cash`;

/** The approved repair reimbursement on a final invoice: its subtotal less its adjusted total. */
export const invoiceReimbursement = (invoice: Pick<Invoice, 'subtotal' | 'total'>) =>
  Math.max(0, Math.round((invoice.subtotal - invoice.total) * 100) / 100);

