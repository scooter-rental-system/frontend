/**
 * The pickup step and odometer readings (BE-046). A paid booking is READY_FOR_PICKUP: an admin hands the scooter over
 * and records its starting odometer, then the customer confirms the start, and only then does the rental begin (the
 * server records the actual start). At return an admin records the ending odometer; the billed distance is the
 * difference. GPS is monitoring only and never billed. Kept free of runtime imports so `npm test` can run it.
 */

/** Admin only: confirm the physical handover with the starting odometer. */
export const handoverPath = (id: string) => `/admin/bookings/${encodeURIComponent(id)}/handover`;
/** The customer confirms the start of their own rental. */
export const startPath = (id: string) => `/bookings/${encodeURIComponent(id)}/start`;
/** Ending the rental: an admin sends the ending odometer. */
export const completePath = (id: string) => `/bookings/${encodeURIComponent(id)}/complete`;

/** The largest reading the backend accepts (NUMERIC(8, 1)). */
export const MAX_ODOMETER_KM = 9_999_999.9;

export const READY_FOR_PICKUP_NOTE =
  'Paid and ready for pickup. Your rental has not started yet: it starts, and is billed from, when our team hands ' +
  'the scooter over and you confirm the start here.';

export const CONFIRM_START_TITLE = 'Confirm rental start';

export const CONFIRM_START_MESSAGE =
  'Confirm only once you have the scooter. Confirming starts the rental timer (you are billed from now), makes ' +
  'your rental active, and starts location monitoring on this page if your browser allows it.';

export const HANDOVER_WAITING_CUSTOMER = 'Handover confirmed. Waiting for the customer to confirm the rental start.';

export const RETURN_AT_COUNTER_NOTE =
  'To end the rental, return the scooter at the rental counter: our team reads the odometer and calculates the ' +
  'final bill.';

export const ODOMETER_BILLING_NOTE =
  'The distance charged is the odometer difference recorded at handover and return.';

export const GPS_NOT_BILLED_NOTE = 'Tracked GPS distance is approximate and is never used for billing.';

export type OdometerResult = { value: number; error?: undefined } | { value?: undefined; error: string };

/** An odometer reading typed by an admin, checked like the backend checks it (km, at most one decimal place). */
export function parseOdometer(text: string, which: 'starting' | 'ending'): OdometerResult {
  const t = text.trim();
  if (!t) return { error: `Enter the ${which} odometer reading` };
  if (!/^\d+(\.\d+)?$/.test(t)) {
    return { error: t.startsWith('-') ? `The ${which} odometer reading cannot be negative` : 'Enter a number of km' };
  }
  const decimals = t.includes('.') ? t.split('.')[1].replace(/0+$/, '').length : 0;
  if (decimals > 1) return { error: `Enter the ${which} odometer reading in km with at most one decimal place` };
  const value = Number(t);
  if (value > MAX_ODOMETER_KM) return { error: `The ${which} odometer reading is too large` };
  return { value };
}

/** The ending reading checked against the starting one; the distance is their difference. */
export function parseEndOdometer(text: string, startKm: number | null): OdometerResult {
  const r = parseOdometer(text, 'ending');
  if (r.error !== undefined || startKm == null) return r;
  if (r.value < startKm) {
    return { error: `The ending odometer (${r.value} km) cannot be lower than the starting odometer (${startKm} km)` };
  }
  return r;
}

/** The distance between two readings, to one decimal place (as the odometer shows it). */
export function odometerDistance(startKm: number | null, endKm: number | null): number | null {
  if (startKm == null || endKm == null || endKm < startKm) return null;
  return Math.round((endKm - startKm) * 10) / 10;
}

type PickupBooking = {
  status: string;
  handoverConfirmedAt: string | null;
  customerStartConfirmedAt: string | null;
};

/**
 * What the pickup step needs next, for whoever is looking:
 * - 'handover': an admin hands the scooter over (with the starting odometer);
 * - 'waiting-customer': handed over, waiting for the customer's start (the admin cannot start it for them);
 * - 'waiting-handover': the customer waits for the handover;
 * - 'confirm-start': the customer confirms the start.
 * null when the booking is not waiting for pickup or the viewer has no part in it.
 */
export type PickupStep = 'handover' | 'waiting-customer' | 'waiting-handover' | 'confirm-start';

export function pickupStep(b: PickupBooking, viewer: { admin: boolean; owner: boolean }): PickupStep | null {
  if (b.status !== 'READY_FOR_PICKUP' || b.customerStartConfirmedAt) return null;
  const handedOver = b.handoverConfirmedAt != null;
  if (viewer.admin) return handedOver ? 'waiting-customer' : 'handover';
  if (viewer.owner) return handedOver ? 'confirm-start' : 'waiting-handover';
  return null;
}

/**
 * A booking ready for pickup is cancelled for a full refund: by the customer only before the handover (afterwards the
 * scooter is with them, so our team cancels it at the counter), by an admin until the rental starts.
 */
export function canCancelPickup(b: PickupBooking, admin: boolean): boolean {
  return b.status === 'READY_FOR_PICKUP' && (admin || b.handoverConfirmedAt == null);
}
