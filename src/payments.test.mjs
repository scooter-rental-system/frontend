// Run with `npm test` (Node's built-in test runner; type stripping loads payments.ts).
// Stripe.js is never loaded here: confirmPayment is a TEST-ONLY stand-in that returns the results Stripe.js
// returns. No network call is made.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  awaitBackendRecord,
  confirmAndAwaitBackend,
  interpretConfirmation,
  interpretRedirectStatus,
  isSettled,
  PAYMENTS_UNAVAILABLE,
  paymentSetup,
  returnUrl,
  singleFlight,
  STRIPE_RETURN_PARAMS,
  stripeMode,
  waitForBackend,
} from './payments.ts';

const noWait = { intervalMs: 0, sleep: async () => {} };

function booking(status, stage) {
  return { id: 'b1', reference: 'SRK-1', status, stage };
}

/** Answers each reload with the next booking state; the last one repeats. */
function backend(...states) {
  let calls = 0;
  const reload = async () => states[Math.min(calls++, states.length - 1)];
  return { reload, calls: () => calls };
}

/** TEST-ONLY stand-in for a Stripe.js instance: records confirmPayment calls and returns queued results. */
function stripeDouble(...results) {
  const calls = [];
  return {
    calls,
    confirmPayment: async (args) => {
      calls.push(args);
      const next = results.length > 1 ? results.shift() : results[0];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const SUCCEEDED = { paymentIntent: { status: 'succeeded' } };
const PROCESSING = { paymentIntent: { status: 'processing' } };
const DECLINED = { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } };

describe('paymentSetup', () => {
  it('is ready with the backend publishable key when Stripe is configured', () => {
    assert.deepEqual(
      paymentSetup({ available: true, provider: 'stripe', publishableKey: 'pk_test_abc', currency: 'LKR' }),
      { ready: true, publishableKey: 'pk_test_abc', currency: 'LKR' },
    );
  });

  it('is unavailable without a provider, with any other provider, or without a key', () => {
    for (const config of [
      { available: false, provider: null, publishableKey: null, currency: 'LKR' },
      { available: true, provider: 'mock', publishableKey: 'pk_test_abc', currency: 'LKR' },
      { available: true, provider: 'paypal', publishableKey: 'pk_test_abc', currency: 'LKR' },
      { available: true, provider: 'stripe', publishableKey: null, currency: 'LKR' },
      { available: true, provider: 'stripe', publishableKey: '', currency: 'LKR' },
      null,
      undefined,
    ]) {
      assert.deepEqual(paymentSetup(config), { ready: false, message: PAYMENTS_UNAVAILABLE });
    }
    assert.equal(PAYMENTS_UNAVAILABLE, 'Payments are currently unavailable.');
  });

  it('tells test and live keys apart for the admin page', () => {
    assert.equal(stripeMode('pk_test_123'), 'test');
    assert.equal(stripeMode('pk_live_123'), 'live');
    assert.equal(stripeMode('something-else'), null);
  });
});

describe('interpretConfirmation', () => {
  it('treats succeeded and processing as submitted, never as paid', () => {
    assert.deepEqual(interpretConfirmation(SUCCEEDED), { submitted: true, processing: false });
    assert.deepEqual(interpretConfirmation(PROCESSING), { submitted: true, processing: true });
  });

  it("keeps Stripe's customer-facing message for card and validation errors", () => {
    assert.deepEqual(interpretConfirmation(DECLINED), { submitted: false, message: 'Your card was declined.' });
    assert.deepEqual(
      interpretConfirmation({ error: { type: 'validation_error', message: 'Your card number is incomplete.' } }),
      { submitted: false, message: 'Your card number is incomplete.' },
    );
  });

  it('hides provider internals behind a generic message', () => {
    const result = interpretConfirmation({ error: { type: 'api_error', message: 'Internal: req_123 failed' } });
    assert.equal(result.submitted, false);
    assert.doesNotMatch(result.message, /req_123|Internal/);
  });

  it('does not treat an unfinished authentication or unknown state as submitted', () => {
    for (const status of ['requires_payment_method', 'requires_action', 'canceled', undefined]) {
      assert.equal(interpretConfirmation({ paymentIntent: { status } }).submitted, false, String(status));
    }
    assert.equal(interpretConfirmation({}).submitted, false);
  });
});

describe('redirect return', () => {
  it("reads Stripe's redirect_status", () => {
    assert.equal(interpretRedirectStatus(null), null);
    assert.deepEqual(interpretRedirectStatus('succeeded'), { submitted: true, processing: false });
    assert.deepEqual(interpretRedirectStatus('processing'), { submitted: true, processing: true });
    assert.equal(interpretRedirectStatus('failed').submitted, false);
  });

  it('returns to the booking page and names the payment', () => {
    assert.equal(returnUrl('https://rent.example', 'b 1', 'initial'), 'https://rent.example/bookings/b%201?payment=initial');
    assert.equal(returnUrl('https://rent.example', 'b1', 'balance'), 'https://rent.example/bookings/b1?payment=balance');
  });

  it("removes Stripe's parameters, including the client secret, from the URL", () => {
    assert.ok(STRIPE_RETURN_PARAMS.includes('payment_intent_client_secret'));
    assert.ok(STRIPE_RETURN_PARAMS.includes('redirect_status'));
  });
});

describe('the backend decides when a payment is recorded', () => {
  it('initial payment: recorded once the booking is no longer pending', () => {
    assert.equal(isSettled(booking('PENDING', 'AWAITING_PAYMENT'), 'initial'), false);
    assert.equal(isSettled(booking('PENDING', 'PAYMENT_FAILED'), 'initial'), false);
    assert.equal(isSettled(booking('ACTIVE', 'UPCOMING'), 'initial'), true);
    // Paid after the booking had ended: the backend refunds it; nothing is left to wait for.
    assert.equal(isSettled(booking('CANCELLED', 'REFUNDED'), 'initial'), true);
  });

  it('balance payment: recorded once the rental no longer has a balance due', () => {
    assert.equal(isSettled(booking('ACTIVE', 'BALANCE_DUE'), 'balance'), false);
    assert.equal(isSettled(booking('COMPLETED', 'COMPLETED'), 'balance'), true);
  });

  it('waitForBackend reloads until settled and gives up after the attempts', async () => {
    const slow = backend(1, 2, 3);
    const sleeps = [];
    const done = await waitForBackend(slow.reload, (v) => v === 3, { attempts: 5, intervalMs: 7, sleep: async (ms) => sleeps.push(ms) });
    assert.deepEqual(done, { settled: true, value: 3 });
    assert.deepEqual(sleeps, [7, 7]);

    const never = backend(0);
    const gaveUp = await waitForBackend(never.reload, () => false, { attempts: 4, ...noWait });
    assert.deepEqual(gaveUp, { settled: false, value: 0 });
    assert.equal(never.calls(), 4);
  });
});

describe('confirmAndAwaitBackend (initial payment)', () => {
  it('confirms once, then reports paid only when the reloaded booking is paid', async () => {
    const stripe = stripeDouble(SUCCEEDED);
    const server = backend(booking('PENDING', 'AWAITING_PAYMENT'), booking('ACTIVE', 'UPCOMING'));
    let submitted = 0;

    const result = await confirmAndAwaitBackend({
      confirm: () => stripe.confirmPayment({ elements: {}, redirect: 'if_required' }),
      reload: server.reload,
      purpose: 'initial',
      onSubmitted: () => submitted++,
      wait: noWait,
    });

    assert.equal(result.status, 'paid');
    assert.equal(result.booking.status, 'ACTIVE');
    assert.equal(stripe.calls.length, 1);
    assert.equal(stripe.calls[0].redirect, 'if_required');
    assert.equal(submitted, 1);
    assert.equal(server.calls(), 2);
  });

  it('a Stripe.js success is not a paid booking while the backend has not recorded it', async () => {
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(SUCCEEDED).confirmPayment,
      reload: backend(booking('PENDING', 'AWAITING_PAYMENT')).reload,
      purpose: 'initial',
      wait: { attempts: 3, ...noWait },
    });
    assert.deepEqual(result, { status: 'pending' });
  });

  it('a processing payment waits for the backend like a succeeded one', async () => {
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(PROCESSING).confirmPayment,
      reload: backend(booking('PENDING', 'AWAITING_PAYMENT'), booking('PENDING', 'AWAITING_PAYMENT'), booking('ACTIVE', 'UPCOMING')).reload,
      purpose: 'initial',
      wait: noWait,
    });
    assert.equal(result.status, 'paid');
  });

  it('a declined card is reported without asking the backend', async () => {
    const server = backend(booking('PENDING', 'AWAITING_PAYMENT'));
    let submitted = 0;
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(DECLINED).confirmPayment,
      reload: server.reload,
      purpose: 'initial',
      onSubmitted: () => submitted++,
      wait: noWait,
    });
    assert.deepEqual(result, { status: 'failed', message: 'Your card was declined.' });
    assert.equal(server.calls(), 0);
    assert.equal(submitted, 0);
  });

  it('a failure to reach Stripe is a generic failure, not a payment', async () => {
    const server = backend(booking('ACTIVE', 'UPCOMING'));
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(new Error('network down: secret details')).confirmPayment,
      reload: server.reload,
      purpose: 'initial',
      wait: noWait,
    });
    assert.equal(result.status, 'failed');
    assert.doesNotMatch(result.message, /secret details/);
    assert.equal(server.calls(), 0);
  });

  it('a failing reload after submission is pending, never failed (the card may have been charged)', async () => {
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(SUCCEEDED).confirmPayment,
      reload: async () => {
        throw new Error('503');
      },
      purpose: 'initial',
      wait: noWait,
    });
    assert.deepEqual(result, { status: 'pending' });
  });

  it('a declined card can be retried on the same form: the next confirmation succeeds', async () => {
    const stripe = stripeDouble(DECLINED, SUCCEEDED);
    const reload = backend(booking('ACTIVE', 'UPCOMING')).reload;
    const first = await confirmAndAwaitBackend({ confirm: stripe.confirmPayment, reload, purpose: 'initial', wait: noWait });
    const second = await confirmAndAwaitBackend({ confirm: stripe.confirmPayment, reload, purpose: 'initial', wait: noWait });
    assert.equal(first.status, 'failed');
    assert.equal(second.status, 'paid');
    assert.equal(stripe.calls.length, 2);
  });
});

describe('balance payment', () => {
  it('is recorded when the backend completes the rental', async () => {
    const result = await confirmAndAwaitBackend({
      confirm: stripeDouble(SUCCEEDED).confirmPayment,
      reload: backend(booking('ACTIVE', 'BALANCE_DUE'), booking('COMPLETED', 'COMPLETED')).reload,
      purpose: 'balance',
      wait: noWait,
    });
    assert.equal(result.status, 'paid');
    assert.equal(result.booking.stage, 'COMPLETED');
  });

  it('"Check again" keeps waiting while the balance is still due', async () => {
    assert.deepEqual(
      await awaitBackendRecord(backend(booking('ACTIVE', 'BALANCE_DUE')).reload, 'balance', { attempts: 2, ...noWait }),
      { status: 'pending' },
    );
  });
});

describe('duplicate submission', () => {
  it('pressing Pay again while a confirmation is running does not confirm twice', async () => {
    const stripe = stripeDouble(SUCCEEDED);
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const pay = singleFlight(async () => {
      await gate;
      return stripe.confirmPayment({});
    });

    const first = pay();
    const second = pay();
    assert.equal(first, second);
    release();
    await first;
    assert.equal(stripe.calls.length, 1);

    // Once finished, a new attempt (e.g. after a decline) runs again.
    await pay();
    assert.equal(stripe.calls.length, 2);
  });

  it('a failed run releases the guard', async () => {
    let runs = 0;
    const flaky = singleFlight(async () => {
      runs++;
      throw new Error('boom');
    });
    await assert.rejects(flaky());
    await assert.rejects(flaky());
    assert.equal(runs, 2);
  });
});

describe('no mock payment path in production code', () => {
  const src = fileURLToPath(new URL('.', import.meta.url));
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const production = files(src).filter((f) => /\.(ts|tsx)$/.test(f));
  const code = production.map((f) => [f, readFileSync(f, 'utf8')]);

  it('has no mock Stripe endpoint, test-card tokens, raw card fields or secret keys', () => {
    const forbidden = [
      /mock-stripe/i,
      /pm_card_/,
      /4242 ?4242/,
      /provider\s*[!=]==\s*['"]mock['"]/,
      /cc-number|cc-csc|cc-exp/,
      /sk_(test|live)_/,
      /whsec_/,
    ];
    for (const [file, text] of code) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(text, pattern, `${file} matches ${pattern}`);
      }
    }
  });

  it('pays through the Stripe Payment Element with the key from the backend', () => {
    const component = readFileSync(join(src, 'components', 'StripePayment.tsx'), 'utf8');
    const stripe = readFileSync(join(src, 'stripe.ts'), 'utf8');
    assert.match(component, /<PaymentElement\b/);
    assert.match(component, /confirmPayment\(/);
    assert.match(stripe, /'\/payments\/config'/);
    assert.match(stripe, /loadStripe\(publishableKey\)/);
    assert.ok(production.every((f) => !/paymentClient|CardPayment/.test(f)), 'old mock payment files are gone');
  });
});
