import type { Booking, PaymentConfig } from './types';

/**
 * Payment rules that don't depend on React or Stripe.js, so they can be tested on their own. The backend stays
 * authoritative: Stripe.js only tells us the payment was submitted; a booking counts as paid once the backend,
 * told by Stripe's webhook, says so.
 */

export const PAYMENTS_UNAVAILABLE = 'Payments are currently unavailable.';
export const PAYMENT_SUBMITTED = 'Payment submitted. Waiting for confirmation from the payment provider…';
export const PAYMENT_STILL_CONFIRMING =
  'Your payment was submitted and is still being confirmed by the payment provider. This page shows the result ' +
  'once it arrives; you will not be charged twice.';
export const SUPPORTED_PROVIDER = 'stripe';

export type PaymentSetup =
  | { ready: true; publishableKey: string; currency: string }
  | { ready: false; message: string };

/** Card payments only work with the Stripe provider and its publishable key; anything else is unavailable. */
export function paymentSetup(config: PaymentConfig | null | undefined): PaymentSetup {
  if (!config || !config.available || config.provider !== SUPPORTED_PROVIDER || !config.publishableKey) {
    return { ready: false, message: PAYMENTS_UNAVAILABLE };
  }
  return { ready: true, publishableKey: config.publishableKey, currency: config.currency };
}

/** Stripe publishable keys say whether they belong to test or live mode; anything else is unknown. */
export function stripeMode(publishableKey: string): 'test' | 'live' | null {
  if (publishableKey.startsWith('pk_test_')) return 'test';
  if (publishableKey.startsWith('pk_live_')) return 'live';
  return null;
}

export type PaymentPurpose = 'initial' | 'balance';

/** Where Stripe sends the customer back after a redirect-based authentication (e.g. some 3D Secure flows). */
export function returnUrl(origin: string, bookingId: string, purpose: PaymentPurpose): string {
  return `${origin}/bookings/${encodeURIComponent(bookingId)}?payment=${purpose}`;
}

/** The parts of a Stripe.js confirmPayment result this app reads. */
export interface ConfirmResult {
  error?: { type?: string; message?: string };
  paymentIntent?: { status?: string };
}

export type ConfirmOutcome = { submitted: true; processing: boolean } | { submitted: false; message: string };

const GENERIC_FAILURE = 'The payment could not be completed. Please try again.';

/**
 * Card and validation errors carry a message written for the customer (e.g. "Your card was declined."); any
 * other error is shown generically so provider internals are not exposed.
 */
export function interpretConfirmation(result: ConfirmResult): ConfirmOutcome {
  if (result.error) {
    const customerFacing = result.error.type === 'card_error' || result.error.type === 'validation_error';
    return { submitted: false, message: (customerFacing && result.error.message) || GENERIC_FAILURE };
  }
  switch (result.paymentIntent?.status) {
    case 'succeeded':
      return { submitted: true, processing: false };
    case 'processing':
      return { submitted: true, processing: true };
    case 'requires_payment_method':
      return { submitted: false, message: 'The payment was not completed. Try again or use another card.' };
    case 'requires_action':
      return { submitted: false, message: 'The card authentication was not completed. Please try again.' };
    default:
      return { submitted: false, message: GENERIC_FAILURE };
  }
}

/** Stripe's redirect_status query parameter on the return URL. */
export function interpretRedirectStatus(status: string | null): ConfirmOutcome | null {
  if (!status) return null;
  if (status === 'succeeded') return { submitted: true, processing: false };
  if (status === 'processing') return { submitted: true, processing: true };
  return { submitted: false, message: 'The payment was not completed. Try again or use another card.' };
}

/** The backend has recorded the initial payment: the booking is no longer waiting for it. */
export function initialPaymentSettled(b: Booking): boolean {
  return b.status !== 'PENDING';
}

/** The backend has recorded the balance: the rental is no longer waiting for it. */
export function balanceSettled(b: Booking): boolean {
  return b.stage !== 'BALANCE_DUE';
}

export function isSettled(b: Booking, purpose: PaymentPurpose): boolean {
  return purpose === 'initial' ? initialPaymentSettled(b) : balanceSettled(b);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface WaitOptions {
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Reloads from the backend until `settled` holds or the attempts run out. The webhook usually arrives within a
 * few seconds of Stripe accepting the payment.
 */
export async function waitForBackend<T>(
  load: () => Promise<T>,
  settled: (value: T) => boolean,
  { attempts = 10, intervalMs = 2000, sleep = defaultSleep }: WaitOptions = {},
): Promise<{ settled: boolean; value: T }> {
  let value = await load();
  for (let i = 1; i < attempts && !settled(value); i++) {
    await sleep(intervalMs);
    value = await load();
  }
  return { settled: settled(value), value };
}

/**
 * Runs at most one call at a time: a second call while one is in flight gets the same promise instead of
 * starting another (no double submission, no second PaymentIntent).
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

/** Stripe's own query parameters on the return URL; removed after reading so the client secret leaves the URL. */
export const STRIPE_RETURN_PARAMS = ['payment_intent', 'payment_intent_client_secret', 'redirect_status', 'payment'];
