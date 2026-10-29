/**
 * Viva demo mode (backend Spring profile `demo` only). Admins can start, end and close a rental without a payment so
 * the lifecycle can be shown locally; nothing is charged and nothing pretends to be a payment. Kept free of runtime
 * imports so `npm test` can run it.
 */

/** Exists only when the backend runs with the demo profile; anywhere else it answers 404. */
export const DEMO_STATUS_PATH = '/demo/status';

export const DEMO_BANNER = 'VIVA DEMO MODE · Demo environment: no real payments are processed.';
export const DEMO_WARNING = 'Demo mode only. No real payment will be processed.';

export const DEMO_LABEL = {
  activate: 'Viva Demo — Activate Rental',
  end: 'Viva Demo — End Rental & Calculate Final Bill',
  close: 'Viva Demo — Close Demo Rental',
} as const;

export type DemoAction = keyof typeof DEMO_LABEL;

export const DEMO_HELP: Record<DemoAction, string> = {
  activate: 'Starts this rental now without a payment, so live GPS and repair reports can be shown.',
  end: 'Ends the rental and calculates the final bill with the normal pricing rules. Nothing is charged.',
  close: 'Cancels this demo rental, voids its unpaid final invoice and makes the scooter available again.',
};

export const DEMO_UNSIGNED = 'The customer must sign the rental agreement before the demo activation.';

/** Shown to everyone on a demo rental, in or out of demo mode. */
export const DEMO_RENTAL_NOTE =
  'No payment has been taken for this rental: it was started in viva demo mode. Its final bill is calculated with ' +
  'the normal pricing rules but not charged.';

type DemoBooking = {
  status: string;
  stage: string;
  contractSigned: boolean;
  payment: unknown;
};

/** A rental started in viva demo mode: active without a payment record. A paid rental always has one. */
export function isDemoRental(b: DemoBooking): boolean {
  return b.status === 'ACTIVE' && !b.payment;
}

/** The demo actions an admin may take on this booking; none outside demo mode or for customers. */
export function demoActions(b: DemoBooking, demo: boolean, admin: boolean): DemoAction[] {
  if (!demo || !admin) return [];
  if (b.status === 'PENDING' && b.contractSigned && !b.payment) return ['activate'];
  if (isDemoRental(b)) return b.stage === 'IN_PROGRESS' ? ['end', 'close'] : ['close'];
  return [];
}

/** Why a pending booking cannot be activated yet, or '' when nothing blocks it. */
export function demoBlocker(b: DemoBooking, demo: boolean, admin: boolean): string {
  return demo && admin && b.status === 'PENDING' && !b.contractSigned && !b.payment ? DEMO_UNSIGNED : '';
}
