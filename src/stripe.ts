import type { Stripe } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { api } from './api';
import type { PaymentConfig } from './types';

/**
 * The payment configuration and the Stripe.js instance, each created once per page load. The publishable key
 * comes from the backend (GET /api/payments/config), never from the frontend build. Stripe.js is loaded from
 * js.stripe.com only when a payment form is shown (the "pure" entry point does not load it on import).
 */

let config: Promise<PaymentConfig> | null = null;

export function loadPaymentConfig(): Promise<PaymentConfig> {
  if (!config) {
    config = api.get<PaymentConfig>('/payments/config').catch((e: unknown) => {
      config = null; // let the next attempt ask again
      throw e;
    });
  }
  return config;
}

const instances = new Map<string, Promise<Stripe | null>>();

export function stripeFor(publishableKey: string): Promise<Stripe | null> {
  let stripe = instances.get(publishableKey);
  if (!stripe) {
    stripe = loadStripe(publishableKey).catch((e: unknown) => {
      instances.delete(publishableKey); // e.g. js.stripe.com unreachable: allow a retry
      throw e;
    });
    instances.set(publishableKey, stripe);
  }
  return stripe;
}
