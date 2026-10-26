import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BookingStepper } from '../components/BookingStepper';
import { StripePayment } from '../components/StripePayment';
import { ErrorAlert, Loading } from '../components/ui';
import { checkoutStep } from '../checkout';
import { date, dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import type { Booking, Contract, PaymentIntent } from '../types';

export default function Checkout() {
  const { id = '' } = useParams();
  const bookingApi = `/bookings/${encodeURIComponent(id)}`;
  const navigate = useNavigate();
  const { user } = useAuth();
  const booking = useLoad(() => api.get<Booking>(bookingApi), [id]);
  const contract = useLoad(() => api.get<Contract>(`${bookingApi}/contract`), [id]);

  const [signedName, setSignedName] = useState('');
  const [agree, setAgree] = useState(false);
  const sign = useAction();

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

  return (
    <div className="booking-page">
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
              <span className="muted">Amount due now</span>
              <strong className="price">{money(b.initialCharge)}</strong>
            </div>
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
          <dl className="summary-lines">
            <div className="summary-line">
              <dt>Scooter</dt>
              <dd className="num">
                {money(b.scooter.hourlyRate)}/hour + {money(b.scooter.perKmRate)}/km
              </dd>
            </div>
            {b.gear.map((g) => (
              <div key={g.gearItemId} className="summary-line">
                <dt>
                  {g.name} × {g.quantity}
                </dt>
                <dd className="num">{money(g.dailyRate * g.quantity)}/day</dd>
              </div>
            ))}
            <div className="summary-line summary-line--total">
              <dt>Pay now</dt>
              <dd className="num">{money(b.initialCharge)}</dd>
            </div>
          </dl>
          <p className="muted small">
            Pay now covers 1 hour and 1 day of gear. When you end the rental, the total for every started hour, the
            kilometres from the GPS log and each started day of gear is calculated, and the balance is charged to the
            same card.
          </p>
        </aside>
      </div>
    </div>
  );
}
