import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { money } from '../format';
import {
  awaitBackendRecord,
  confirmAndAwaitBackend,
  PAYMENT_STILL_CONFIRMING,
  PAYMENT_SUBMITTED,
  CUSTOMER_PAYMENTS_UNAVAILABLE,
  paymentSetup,
  returnUrl,
  singleFlight,
  SUPPORTED_PROVIDER,
  type PaymentPurpose,
  type PaymentResult,
} from '../payments';
import { loadPaymentConfig, stripeFor } from '../stripe';
import { useTheme } from '../theme';
import type { Booking, PaymentIntent } from '../types';
import { ErrorAlert, Loading } from './ui';

type Setup =
  | { state: 'loading' }
  | { state: 'unavailable'; message: string }
  | { state: 'error'; message: string }
  | { state: 'ready'; stripe: Promise<Stripe | null>; clientSecret: string };

/**
 * Card payment with the Stripe Payment Element (SDS 4.2). Card details are entered in Stripe's own fields and
 * go straight to Stripe; this app never sees them. The backend creates the PaymentIntent (and the amount) and is
 * told the outcome by Stripe's webhook, so a payment only counts once the reloaded booking says it is paid.
 *
 * One PaymentIntent is created when the form is shown, not on each click: every new intent replaces the
 * previous one on the backend. A declined card is retried on the same intent.
 */
export function StripePayment({
  bookingId,
  purpose,
  amount,
  createIntent,
  reload,
  onSettled,
  disabled,
  billingName,
  billingEmail,
}: {
  bookingId: string;
  purpose: PaymentPurpose;
  amount: number;
  createIntent: () => Promise<PaymentIntent>;
  /** Reloads the booking from the backend. */
  reload: () => Promise<Booking>;
  /** Called with the reloaded booking once the backend has recorded the payment. */
  onSettled: (booking: Booking) => void;
  disabled?: boolean;
  billingName?: string;
  billingEmail?: string;
}) {
  const [setup, setSetup] = useState<Setup>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const requested = useRef(false);
  const mounted = useRef(false);
  const { resolved } = useTheme();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // The ref also absorbs React StrictMode's second effect run in development: one intent per form. The
    // result is applied through `mounted` rather than a per-run flag, so that second run does not discard it.
    if (disabled || requested.current) return;
    requested.current = true;
    const show = (next: Setup) => mounted.current && setSetup(next);
    (async () => {
      try {
        const config = paymentSetup(await loadPaymentConfig());
        if (!config.ready) {
          show({ state: 'unavailable', message: config.message });
          return;
        }
        const intent = await createIntent();
        if (intent.provider !== SUPPORTED_PROVIDER || !intent.clientSecret) {
          show({ state: 'unavailable', message: CUSTOMER_PAYMENTS_UNAVAILABLE });
          return;
        }
        show({ state: 'ready', stripe: stripeFor(config.publishableKey), clientSecret: intent.clientSecret });
      } catch (e) {
        requested.current = false; // allow "Try again"
        show({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    // createIntent is recreated on every parent render; the intent is requested once per form (or per "Try
    // again") on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, attempt]);

  if (disabled) return null;
  if (setup.state === 'loading') return <Loading what="Preparing secure payment" />;
  if (setup.state === 'unavailable') {
    return (
      <div className="alert" role="alert">
        {setup.message}
      </div>
    );
  }
  if (setup.state === 'error') {
    return (
      <div className="stack">
        <ErrorAlert error={setup.message} />
        <button
          onClick={() => {
            setSetup({ state: 'loading' });
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={setup.stripe}
      options={{ clientSecret: setup.clientSecret, appearance: { theme: resolved === 'dark' ? 'night' : 'stripe' } }}
    >
      <PaymentForm
        bookingId={bookingId}
        purpose={purpose}
        amount={amount}
        reload={reload}
        onSettled={onSettled}
        billingName={billingName}
        billingEmail={billingEmail}
      />
    </Elements>
  );
}

type Phase = { step: 'entry' } | { step: 'submitting' } | { step: 'confirming' } | { step: 'pending' };

function PaymentForm({
  bookingId,
  purpose,
  amount,
  reload,
  onSettled,
  billingName,
  billingEmail,
}: {
  bookingId: string;
  purpose: PaymentPurpose;
  amount: number;
  reload: () => Promise<Booking>;
  onSettled: (booking: Booking) => void;
  billingName?: string;
  billingEmail?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [phase, setPhase] = useState<Phase>({ step: 'entry' });
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const show = useCallback(
    (result: PaymentResult) => {
      if (result.status === 'paid') {
        onSettled(result.booking);
      } else if (result.status === 'pending') {
        setPhase({ step: 'pending' });
      } else {
        setMessage(result.message);
        setPhase({ step: 'entry' });
      }
    },
    [onSettled],
  );

  // One confirmation at a time, however often the button is pressed. The guarded function is created once and
  // reads the current Stripe objects through a ref (they are null until Stripe.js has loaded).
  const latest = useRef({ stripe, elements, reload, show });
  latest.current = { stripe, elements, reload, show };
  const confirmRef = useRef<(() => Promise<void>) | null>(null);
  confirmRef.current ??= singleFlight(async () => {
    const { stripe, elements, reload, show } = latest.current;
    if (!stripe || !elements) return;
    setMessage(null);
    setPhase({ step: 'submitting' });
    show(
      await confirmAndAwaitBackend({
        confirm: () =>
          stripe.confirmPayment({
            elements,
            confirmParams: { return_url: returnUrl(window.location.origin, bookingId, purpose) },
            // Card payments stay on this page; Stripe redirects only if the card's authentication requires it.
            redirect: 'if_required',
          }),
        reload,
        purpose,
        onSubmitted: () => setPhase({ step: 'confirming' }),
      }),
    );
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void confirmRef.current?.();
  };

  const checkAgain = async () => {
    setPhase({ step: 'confirming' });
    show(await awaitBackendRecord(reload, purpose));
  };

  if (phase.step === 'confirming') {
    return (
      <div className="alert info" role="status">
        {PAYMENT_SUBMITTED}
      </div>
    );
  }
  if (phase.step === 'pending') {
    return (
      <div className="stack">
        <div className="alert info" role="status">
          {PAYMENT_STILL_CONFIRMING}
        </div>
        <button onClick={() => void checkAgain()}>Check again</button>
      </div>
    );
  }

  const busy = phase.step === 'submitting';
  return (
    <form className="stack" onSubmit={submit}>
      <PaymentElement
        options={{
          layout: 'tabs',
          defaultValues: { billingDetails: { name: billingName, email: billingEmail } },
        }}
        onChange={(e) => setComplete(e.complete)}
      />
      {message && (
        <div className="alert" role="alert">
          {message}
        </div>
      )}
      <button type="submit" className="primary" disabled={!stripe || !elements || !complete || busy}>
        {busy ? 'Processing…' : `Pay ${money(amount)}`}
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        Card details are entered into Stripe's secure form and never reach Scooter Rent Kandy.
      </p>
    </form>
  );
}
