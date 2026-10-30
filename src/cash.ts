/**
 * Cash at the rental counter (backend BE-044). Cash is not a checkout option: the customer pays online (card, QR Pay
 * or bank transfer), and only an admin records cash, when the customer hands over the final balance at the counter
 * (or cash is handed back on a booking paid in cash before). Nothing here marks anything paid: these helpers
 * describe the state the backend returned and pick the one admin confirmation that applies. Kept free of React so
 * they can be tested alone.
 */
import type { Booking, Invoice, PaymentStatus } from './types';

// Same formatting as format.ts money(); a local copy because Node's test runner loads this file without a bundler.
const lkr = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const money = (n: number) => lkr.format(n);

/** The customer's checkout choices. QR Pay and Bank Transfer are offered only when enabled (see transfers.ts). */
export type CheckoutMethod = 'CARD' | 'QR_TRANSFER' | 'BANK_TRANSFER';

export const METHOD_LABEL: Record<CheckoutMethod, string> = {
  CARD: 'Card / Online Payment',
  QR_TRANSFER: 'QR Pay',
  BANK_TRANSFER: 'Bank Transfer',
};

/** Shown to the customer next to the online ways to pay a final balance. The customer never marks cash paid. */
export const COUNTER_BALANCE_NOTE =
  'You may also pay the outstanding balance directly at the rental counter. A staff member will confirm the cash payment.';

export const CASH_END_NOTE =
  'The final total is calculated. Pay any remaining balance in cash at the rental counter; if you paid more than the final total, the difference is handed back to you there.';

export const CASH_CANCEL_NOTE = 'Cancel this booking? The cash you paid is handed back to you at the rental counter.';

/** A booking paid in cash at the counter before cash left the checkout. */
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

export type CashStep = 'balance' | 'refund';

export interface CashAction {
  step: CashStep;
  amount: number;
  /** What the amount is, e.g. "Cash due". */
  dueLabel: string;
  /** The button, with the exact amount. */
  label: string;
  title: string;
  message: string;
}

const isManual = (m: string | null | undefined) => m === 'CASH' || m === 'QR_TRANSFER' || m === 'BANK_TRANSFER';

/**
 * The admin confirmation this booking is waiting for, if any. "Confirm Cash Payment Received" for the final balance
 * once the final bill is fixed: only while a balance is due (not a refund, not zero), the rental is not completed or
 * cancelled, and no QR or bank transfer receipt waits for verification (approve or reject it first). On a booking
 * paid in cash earlier, cash to hand back. Never offered to a customer, and never for a card payment, whose balance
 * stays with the payment provider. The amount is the backend's; the backend refuses any other.
 */
export function cashAction(b: Booking, admin: boolean): CashAction | null {
  const p = b.payment;
  if (!admin || !p || !isManual(p.method)) return null;
  const receiptWaiting = p.receipts?.some((r) => r.status === 'PENDING_VERIFICATION') ?? false;
  if (b.status === 'ACTIVE' && b.endedAt && p.balanceDue != null && p.balanceDue > 0 && !receiptWaiting) {
    return {
      step: 'balance',
      amount: p.balanceDue,
      dueLabel: 'Cash due',
      label: `Confirm Cash Payment Received — ${money(p.balanceDue)}`,
      title: 'Confirm cash payment received?',
      message: `Confirm only after you have received ${money(p.balanceDue)} in cash from ${b.customer.fullName} at the counter. It is recorded as a cash payment, the invoice is settled and the booking is completed.`,
    };
  }
  if (p.method === 'CASH' && p.refundDue != null) {
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

/** The approved repair reimbursement on a final invoice: its subtotal less its adjusted total. */
export const invoiceReimbursement = (invoice: Pick<Invoice, 'subtotal' | 'total'>) =>
  Math.max(0, Math.round((invoice.subtotal - invoice.total) * 100) / 100);
