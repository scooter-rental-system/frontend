import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BackLink } from '../components/BackLink';
import { BookingStepper } from '../components/BookingStepper';
import { StripePayment } from '../components/StripePayment';
import { ReceiptUpload, TransferInstructions } from '../components/TransferPay';
import { ErrorAlert, Loading } from '../components/ui';
import { CASH_CHECKOUT_NOTE, CASH_HOLD_NOTE, chooseCashPath, isCashBooking, METHOD_LABEL, type CheckoutMethod } from '../cash';
import { checkoutStep } from '../checkout';
import { date, dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import { bookingPath } from '../routes';
import { DISTANCE_PRICING_RULE, GEAR_PRICING_RULE, INCLUDED_KM_PER_DAY, SCOOTER_PRICING_RULE } from '../pricing';
import {
  chooseTransferPath,
  isTransferMethod,
  latestReceipt,
  offeredTransfers,
  PAYMENT_OPTIONS_PATH,
  pendingReceipt,
  RECEIPT_WAITING,
  verificationHoldNote,
} from '../transfers';
import type { Booking, Contract, PaymentIntent, PaymentOptions } from '../types';

export default function Checkout() {
  const { id = '' } = useParams();
  const bookingApi = `/bookings/${encodeURIComponent(id)}`;
  const navigate = useNavigate();
  const { user } = useAuth();
  const booking = useLoad(() => api.get<Booking>(bookingApi), [id]);
  const contract = useLoad(() => api.get<Contract>(`${bookingApi}/contract`), [id]);
  // The QR and bank transfer details an administrator enabled (only those are offered).
  const options = useLoad(() => api.get<PaymentOptions>(PAYMENT_OPTIONS_PATH), []);

  const [signedName, setSignedName] = useState('');
  const [agree, setAgree] = useState(false);
  const sign = useAction();
  // Card goes through the payment provider; cash is paid at the counter and recorded by an admin. Cash does not
  // depend on the card provider, so it stays selectable when card payments are unavailable.
  const [chosen, setChosen] = useState<CheckoutMethod | null>(null);
  const payCash = useAction();
  const chooseTransfer = useAction();

  if (booking.loading || contract.loading) return <Loading />;
  if (!booking.data || !contract.data) return <ErrorAlert error={booking.error ?? contract.error} />;
  const b = booking.data;
  const c = contract.data;

  if (b.status !== 'PENDING') {
    return (
      <div className="card stack">
        <p>
          This booking is <strong>{b.status.toLowerCase()}</strong>.
        </p>
        <Link to={`/bookings/${b.id}`} className="btn">
          View booking
        </Link>
      </div>
    );
  }

  const doSign = async () => {
    const res = await sign.run(() => api.post<Contract>(`${bookingApi}/contract/sign`, { signedName, agree }));
    if (res) contract.setData(res);
  };

  const pendingMethod = b.payment?.status === 'PENDING' ? b.payment.method : null;
  const method: CheckoutMethod =
    chosen ?? (isCashBooking(b) ? 'CASH' : isTransferMethod(pendingMethod) ? pendingMethod : 'CARD');
  const cashChosen = isCashBooking(b) && b.payment?.status === 'PENDING';
  // QR Pay and Bank Transfer appear only while enabled (or already chosen for this booking).
  const transferChoices = offeredTransfers(options.data);
  if (isTransferMethod(pendingMethod) && !transferChoices.includes(pendingMethod)) transferChoices.push(pendingMethod);
  const waiting = pendingReceipt(b.payment?.receipts);
  const lastReceipt = latestReceipt(b.payment?.receipts, 'INITIAL');
  // The transfer is made outside this app; the receipt only waits for an administrator to verify it.
  const recordTransfer = async () => {
    if (!isTransferMethod(method)) return false;
    if (b.payment?.method === method && b.payment.status === 'PENDING') return true;
    const res = await chooseTransfer.run(() => api.post<Booking>(chooseTransferPath(b.id), { method }));
    if (res) booking.setData(res);
    return !!res;
  };
  // Choosing cash records nothing as paid: the booking waits for an administrator to record the cash.
  const doPayCash = async () => {
    const res = await payCash.run(() => api.post<Booking>(chooseCashPath(b.id)));
    if (res) navigate(`/bookings/${b.id}`);
  };

  return (
    <div className="booking-page">
      <BackLink fallback={bookingPath(b.id)} label="Booking details" />
      <div className="page-header">
        <span className="eyebrow">Secure checkout · {b.reference}</span>
        <p className="checkout-heading">
          Complete your <span className="accent-text">booking</span>
        </p>
      </div>
      <BookingStepper current={checkoutStep(c.signed)} />

      <div className="booking-layout">
        <div className="booking-main">
          <section className={`card checkout-task${c.signed ? ' is-complete' : ' is-active'}`} aria-labelledby="agreement-title">
            <div className="checkout-task__head">
              <h1 id="agreement-title" className="checkout-task__title">
                Rental agreement
              </h1>
              <span className={`badge ${c.signed ? 'green' : 'amber'}`}>{c.signed ? 'Signed' : 'To sign'}</span>
            </div>
            <div className="contract" tabIndex={0} role="region" aria-label={`Rental agreement ${c.contractNumber}`}>
              {c.termsText}
            </div>
            {c.signed ? (
              <div className="alert success" role="status">
                Signed by <strong>{c.signedName}</strong> on {date(c.signedAt)}.
              </div>
            ) : (
              <div className="stack">
                <label className="inline">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I have read and
                  agree to the rental terms
                </label>
                <label>
                  Type your full name to sign
                  <input
                    value={signedName}
                    onChange={(e) => setSignedName(e.target.value)}
                    autoComplete="name"
                    aria-describedby="sign-name-hint"
                  />
                </label>
                <p id="sign-name-hint" className="muted small">
                  As on your account: {user?.fullName}
                </p>
                <ErrorAlert error={sign.error} />
                <button className="primary checkout-task__action" disabled={!agree || !signedName || sign.busy} onClick={doSign}>
                  {sign.busy ? 'Signing…' : 'Sign agreement'}
                </button>
              </div>
            )}
          </section>

          <section
            className={`card checkout-task${c.signed ? ' is-active' : ' is-locked'}`}
            aria-labelledby="payment-title"
          >
            <div className="checkout-task__head">
              <h2 id="payment-title" className="checkout-task__title">
                Payment
              </h2>
              <span className={`badge ${c.signed ? 'blue' : ''}`}>{c.signed ? 'Ready to pay' : 'Locked'}</span>
            </div>
            <div className="checkout-amount">
              <span className="muted">Pay now</span>
              <strong className="price">{money(b.initialCharge)}</strong>
            </div>
            <fieldset className="payment-methods" disabled={!c.signed}>
              <legend>Payment method</legend>
              {(['CARD', 'CASH'] as const).map((m) => (
                <label key={m} className={`payment-method${method === m ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment-method"
                    value={m}
                    checked={method === m}
                    onChange={() => setChosen(m)}
                  />
                  {METHOD_LABEL[m]}
                </label>
              ))}
              {transferChoices.map((m) => (
                <label key={m} className={`payment-method${method === m ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment-method"
                    value={m}
                    checked={method === m}
                    onChange={() => setChosen(m)}
                  />
                  {METHOD_LABEL[m]}
                </label>
              ))}
            </fieldset>
            {b.stage === 'PAYMENT_FAILED' && b.payment?.failureReason && (
              <div className="alert" role="alert">
                Last attempt failed: {b.payment.failureReason}
              </div>
            )}
            {!c.signed && (
              <p className="checkout-locked">
                <span aria-hidden>🔒</span> Sign the rental agreement above to unlock payment.
              </p>
            )}
            {method === 'CASH' && (
              <div className="stack">
                <div className="alert info" role="note">
                  {CASH_CHECKOUT_NOTE}
                </div>
                <p className="muted small">{CASH_HOLD_NOTE}</p>
                <ErrorAlert error={payCash.error} />
                {cashChosen ? (
                  <Link to={`/bookings/${b.id}`} className="btn primary checkout-task__action">
                    View booking
                  </Link>
                ) : (
                  <button className="primary checkout-task__action" disabled={!c.signed || payCash.busy} onClick={doPayCash}>
                    {payCash.busy ? 'Saving…' : `Pay ${money(b.initialCharge)} in cash at the counter`}
                  </button>
                )}
              </div>
            )}
            {isTransferMethod(method) && c.signed && (
              <div className="stack">
                {waiting ? (
                  <>
                    <div className="alert info" role="status">
                      {RECEIPT_WAITING}
                    </div>
                    <p className="muted small">
                      Your booking is confirmed once an administrator verifies that {money(waiting.amount)} reached our
                      account.
                    </p>
                    <Link to={`/bookings/${b.id}`} className="btn primary checkout-task__action">
                      View booking
                    </Link>
                  </>
                ) : options.data ? (
                  <>
                    {lastReceipt?.status === 'REJECTED' && (
                      <div className="alert" role="alert">
                        Your last receipt was not accepted: {lastReceipt.rejectionReason}. Please upload a new receipt.
                      </div>
                    )}
                    <TransferInstructions
                      method={method}
                      options={options.data}
                      amount={b.initialCharge}
                      reference={b.reference}
                    />
                    <p className="muted small">{verificationHoldNote(options.data)}</p>
                    <ErrorAlert error={chooseTransfer.error} />
                    <ReceiptUpload
                      booking={b}
                      method={method}
                      sendMethod={false}
                      prepare={recordTransfer}
                      onSubmitted={booking.setData}
                    />
                  </>
                ) : (
                  <ErrorAlert error={options.error} />
                )}
              </div>
            )}
            {method === 'CARD' && (
              <>
                <div className="stripe-container">
                  <StripePayment
                    bookingId={b.id}
                    purpose="initial"
                    amount={b.initialCharge}
                    disabled={!c.signed}
                    billingName={user?.fullName}
                    billingEmail={user?.email}
                    createIntent={() => api.post<PaymentIntent>(`/bookings/${b.id}/payment-intent`)}
                    reload={() => api.get<Booking>(`/bookings/${b.id}`)}
                    onSettled={() => navigate(`/bookings/${b.id}?paid=1`)}
                  />
                </div>
                {c.signed && (
                  <p className="muted small">
                    Your booking is confirmed once Stripe tells us the payment succeeded. This page waits for that
                    confirmation before moving on.
                  </p>
                )}
                <ul className="checkout-trust" aria-label="About this payment">
                  <li>Processed by Stripe</li>
                  <li>Card details never reach our servers</li>
                  <li>Booked only once the payment succeeds</li>
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="card booking-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">Booking summary</h2>
          <div>
            <strong>{b.scooter.model}</strong> <span className="muted">({b.scooter.plateNumber})</span>
            <p className="muted small">Booking {b.reference}</p>
          </div>
          <dl className="summary-facts small">
            <div>
              <dt>Starts</dt>
              <dd>{dateTime(b.startTime)}, until you end the rental</dd>
            </div>
            <div>
              <dt>Pick-up</dt>
              <dd>{b.pickupLocation}</dd>
            </div>
          </dl>
          <h3 className="summary-subtitle">Rates</h3>
          <dl className="summary-lines summary-rates">
            <div className="summary-line">
              <dt>Daily rate</dt>
              <dd className="num">{money(b.scooter.dailyRate)}</dd>
            </div>
            <div className="summary-line">
              <dt>Extra-hour rate</dt>
              <dd className="num">{money(b.scooter.hourlyRate)}</dd>
            </div>
            <div className="summary-line">
              <dt>Excess-distance rate</dt>
              <dd className="num">{money(b.scooter.perKmRate)}/km</dd>
            </div>
            <div className="summary-line">
              <dt>Included distance</dt>
              <dd>{INCLUDED_KM_PER_DAY} km per charged rental day</dd>
            </div>
            {b.gear.map((g) => (
              <div key={g.gearItemId} className="summary-line">
                <dt>
                  {g.name} × {g.quantity}
                </dt>
                <dd className="num">{money(g.dailyRate * g.quantity)}/day</dd>
              </div>
            ))}
          </dl>

          <h3 className="summary-subtitle">Pay now</h3>
          <dl className="summary-lines">
            <div className="summary-line">
              <dt>One-hour minimum</dt>
              <dd className="num">{money(b.scooter.hourlyRate)}</dd>
            </div>
            {b.gear.map((g) => (
              <div key={g.gearItemId} className="summary-line">
                <dt>
                  {g.name} × {g.quantity}, first day
                </dt>
                <dd className="num">{money(g.dailyRate * g.quantity)}</dd>
              </div>
            ))}
            <div className="summary-line summary-line--total">
              <dt>Pay now</dt>
              <dd className="num">{money(b.initialCharge)}</dd>
            </div>
          </dl>
          <p className="small">
            Pay now covers the one-hour minimum{b.gear.length > 0 && ' and the first day of your camping gear'}. Your
            final rental charge is calculated when the rental ends using rental time, excess distance and any camping
            gear.
          </p>

          <dl className="summary-facts summary-stages small">
            <div>
              <dt>Pay now</dt>
              <dd>
                {money(b.initialCharge)},{' '}
                {method === 'CASH'
                  ? 'paid in cash at the rental counter.'
                  : isTransferMethod(method)
                    ? 'transferred by you, and confirmed once an administrator verifies your receipt.'
                    : 'charged when you pay below.'}
              </dd>
            </div>
            <div>
              <dt>Final total</dt>
              <dd>Not known yet: the rental has no fixed end. It is calculated when you end the rental.</dd>
            </div>
            <div>
              <dt>Balance</dt>
              <dd>
                {method === 'CASH'
                  ? 'Final total minus pay now, paid in cash at the counter when the rental ends (any excess is handed back in cash).'
                  : isTransferMethod(method)
                    ? 'Final total minus pay now, transferred when the rental ends with a new receipt (any excess is refunded to you by our team).'
                    : 'Final total minus pay now, charged to the same card when the rental ends (any excess is refunded).'}
              </dd>
            </div>
          </dl>

          <p className="muted small">{SCOOTER_PRICING_RULE}</p>
          <p className="muted small">{DISTANCE_PRICING_RULE}</p>
          {b.gear.length > 0 && <p className="muted small">{GEAR_PRICING_RULE}</p>}
        </aside>
      </div>
    </div>
  );
}
