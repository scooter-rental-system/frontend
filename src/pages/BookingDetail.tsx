import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BookingStepper } from '../components/BookingStepper';
import { BookingTimeline } from '../components/BookingTimeline';
import { useConfirm } from '../useConfirm';
import { StripePayment } from '../components/StripePayment';
import InvoiceView from '../components/InvoiceView';
import MapView from '../components/MapView';
import { DetailRow, ErrorAlert, Loading, StageBadge, Stat, StatusBadge } from '../components/ui';
import { paymentLabel } from '../checkout';
import { dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import {
  awaitBackendRecord,
  interpretRedirectStatus,
  PAYMENT_STILL_CONFIRMING,
  PAYMENT_SUBMITTED,
  STRIPE_RETURN_PARAMS,
  type PaymentPurpose,
} from '../payments';
import { GPS_STATUS_TEXT, isTrackingOff, shouldReportLocation } from '../gps';
import { liveState, SPEED_LIMIT_KMH, speedState, STAGE_HELP } from '../rental';
import { checkoutPath } from '../routes';
import { useRiderGps } from '../useRiderGps';
import { excessKm, gearDays as chargedGearDays, INCLUDED_KM_PER_DAY, scooterTime, scooterTimeCost } from '../pricing';
import { isAdmin } from '../types';
import type { Booking, BookingStage, Contract, Invoice, PaymentIntent, Tracking } from '../types';

const STAGE_TEXT: Record<BookingStage, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  UPCOMING: 'Paid · starts soon',
  IN_PROGRESS: 'Rental in progress',
  BALANCE_DUE: 'Ended · balance due',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Cancelled · refunded',
};

/**
 * Back from a Stripe redirect (some card authentications leave the page): Stripe adds redirect_status and the
 * intent's id and client secret to the URL. They are removed straight away; the page then waits for the backend,
 * which hears the result from Stripe's webhook, before showing the payment as done.
 */
function usePaymentReturn(id: string, setBooking: (b: Booking) => void, reloadInvoices: () => void) {
  const bookingApi = `/bookings/${encodeURIComponent(id)}`;
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const outcome = interpretRedirectStatus(params.get('redirect_status'));
    if (!outcome) return;
    handled.current = true;
    const purpose: PaymentPurpose = params.get('payment') === 'balance' ? 'balance' : 'initial';
    const next = new URLSearchParams(params);
    STRIPE_RETURN_PARAMS.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
    if (!outcome.submitted) {
      setNotice({ text: outcome.message, error: true });
      return;
    }
    setNotice({ text: PAYMENT_SUBMITTED });
    awaitBackendRecord(() => api.get<Booking>(bookingApi), purpose).then((result) => {
      if (result.status !== 'paid') {
        setNotice({ text: PAYMENT_STILL_CONFIRMING });
        return;
      }
      setBooking(result.booking);
      reloadInvoices();
      if (purpose === 'initial') {
        setNotice(null);
        next.set('paid', '1');
        setParams(next, { replace: true });
      } else {
        setNotice({ text: 'Balance paid. Thank you!' });
      }
    });
  }, [bookingApi, params, setParams, setBooking, reloadInvoices]);

  return notice;
}

export default function BookingDetail() {
  const { id = '' } = useParams();
  const bookingApi = `/bookings/${encodeURIComponent(id)}`;
  const [params] = useSearchParams();
  const { user } = useAuth();
  const booking = useLoad(() => api.get<Booking>(bookingApi), [id]);
  const invoices = useLoad(() => api.get<Invoice[]>(`${bookingApi}/invoices`), [id]);
  const [showContract, setShowContract] = useState(false);
  const contract = useLoad(
    () => (showContract ? api.get<Contract>(`${bookingApi}/contract`) : Promise.resolve(null)),
    [id, showContract],
  );
  const cancel = useAction();
  const end = useAction();
  const { confirm, dialog } = useConfirm();
  const paymentReturn = usePaymentReturn(id, booking.setData, invoices.reload);

  if (booking.loading) return <Loading />;
  if (!booking.data) return <ErrorAlert error={booking.error} />;
  const b = booking.data;
  const isOwner = user?.id === b.customer.id;
  const canCancel = b.stage === 'AWAITING_PAYMENT' || b.stage === 'PAYMENT_FAILED' || b.stage === 'UPCOMING';
  const canEnd = b.stage === 'IN_PROGRESS' && (isOwner || isAdmin(user?.role));

  const refresh = () => {
    booking.reload();
    invoices.reload();
  };

  const doCancel = async () => {
    const msg =
      b.status === 'ACTIVE' ? 'Cancel this booking? You will receive a full refund.' : 'Cancel this reservation?';
    const ok = await confirm({
      title: 'Cancel booking?',
      message: msg,
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
      destructive: true,
    });
    if (!ok) return;
    if (await cancel.run(() => api.post<Booking>(`${bookingApi}/cancel`))) refresh();
  };

  // Ending charges the remaining balance; if that fails the booking stays ACTIVE with the balance due.
  const doEnd = async () => {
    const ok = await confirm({
      title: 'End the rental now?',
      message: 'The final total is calculated and the balance charged to your card.',
      confirmLabel: 'End rental',
      cancelLabel: 'Keep riding',
    });
    if (!ok) return;
    await end.run(() => api.put<Booking>(`${bookingApi}/complete`, {}));
    refresh();
  };

  return (
    <div className="booking-page">
      {dialog}
      {/* Back from Checkout: shown only once the backend reports the booking ACTIVE (payment confirmed). */}
      {params.get('paid') && b.status === 'ACTIVE' && (
        <>
          <BookingStepper current={3} />
          <div className="alert success" role="status">
            Payment received. Your scooter is booked!
          </div>
        </>
      )}
      {paymentReturn && (
        <div className={`alert ${paymentReturn.error ? '' : 'info'}`} role={paymentReturn.error ? 'alert' : 'status'}>
          {paymentReturn.text}
        </div>
      )}

      <header className="card booking-header">
        <div className="booking-header__main">
          <p className="muted small">Booking</p>
          <h1>{b.reference}</h1>
          <div className="row">
            <StageBadge stage={b.stage} status={b.status} />
            <span className="muted small">{STAGE_TEXT[b.stage]}</span>
          </div>
          <p className="booking-header__help">{STAGE_HELP[b.stage]}</p>
          <p className="muted small">
            {b.scooter.model} ({b.scooter.plateNumber}) · {b.pickupLocation}
          </p>
        </div>
        <div className="booking-header__actions">
          {b.status === 'PENDING' && isOwner && (
            <Link className="btn primary" to={checkoutPath(b.id)}>
              {b.stage === 'PAYMENT_FAILED' ? 'Try payment again' : 'Sign & pay'}
            </Link>
          )}
          {canEnd && (
            <button className="primary booking-header__end" onClick={doEnd} disabled={end.busy}>
              {end.busy ? 'Ending rental…' : 'End rental'}
            </button>
          )}
          {canCancel && (
            <button className="danger" onClick={doCancel} disabled={cancel.busy}>
              Cancel booking
            </button>
          )}
        </div>
      </header>

      <BookingTimeline stage={b.stage} />

      <ErrorAlert error={cancel.error} />
      {b.stage === 'PAYMENT_FAILED' && b.payment?.failureReason && (
        <div className="alert" role="alert">
          Payment failed: {b.payment.failureReason}
        </div>
      )}
      {b.stage === 'UPCOMING' && (
        <div className="alert info">
          Paid. Your rental starts {dateTime(b.startTime)}. You can cancel for a full refund until then.
        </div>
      )}

      {b.stage === 'BALANCE_DUE' && (
        <BalanceDue booking={b} isOwner={isOwner} retrying={end.busy} onRetry={doEnd} onPaid={refresh} />
      )}
      {b.stage !== 'BALANCE_DUE' && <ErrorAlert error={end.error} />}

      {b.stage === 'IN_PROGRESS' && <LiveTracking booking={b} reportLocation={shouldReportLocation(b, user?.id)} />}

      <div className="grid-2">
        <section className="card stack" aria-labelledby="details-title">
          <h2 id="details-title">Rental details</h2>
          <dl className="small">
            <DetailRow label="Scooter">
              {b.scooter.model} ({b.scooter.plateNumber})
            </DetailRow>
            <DetailRow label="Rates">
              {money(b.scooter.dailyRate)}/day · {money(b.scooter.hourlyRate)}/extra hour ·{' '}
              {money(b.scooter.perKmRate)}/km above the {INCLUDED_KM_PER_DAY} km per day included
            </DetailRow>
            <DetailRow label="Started">{dateTime(b.startTime)}</DetailRow>
            {(b.endTime ?? b.endedAt) && (
              <DetailRow label="Ended">
                {dateTime(b.endTime ?? b.endedAt)} · {b.billableHours} hour{b.billableHours === 1 ? '' : 's'} ·{' '}
                {b.distanceKm ?? b.pendingDistanceKm} km
              </DetailRow>
            )}
            {b.breakdown && (
              <>
                <DetailRow label="Charged time">
                  {b.breakdown.chargedDays} day{b.breakdown.chargedDays === 1 ? '' : 's'} + {b.breakdown.extraHours} extra
                  hour{b.breakdown.extraHours === 1 ? '' : 's'}
                </DetailRow>
                <DetailRow label="Distance">
                  {b.breakdown.includedKm} km included · {b.breakdown.excessKm} km charged
                </DetailRow>
              </>
            )}
            <DetailRow label="Pickup">{b.pickupLocation ?? '—'}</DetailRow>
            {b.dropLocation && <DetailRow label="Returned at">{b.dropLocation}</DetailRow>}
            {b.gear.length > 0 && (
              <DetailRow label="Gear">
                {b.gear.map((g) => `${g.name} ×${g.quantity} (${money(g.dailyRate)}/day)`).join(', ')}
              </DetailRow>
            )}
            <DetailRow label="Charged at booking">
              {money(b.initialCharge)} (the one-hour minimum + 1 day of gear; the rest is charged when the rental ends)
            </DetailRow>
            {(b.totalCost ?? b.pendingTotalCost) != null && (
              <DetailRow label="Final total">
                <strong>{money(b.totalCost ?? b.pendingTotalCost)}</strong>
                {b.totalCost == null && <span className="muted small"> (balance due)</span>}
              </DetailRow>
            )}
          </dl>
          <button className="small" onClick={() => setShowContract(!showContract)}>
            {showContract ? 'Hide' : 'View'} rental agreement {b.contractSigned ? '(signed)' : '(unsigned)'}
          </button>
          {contract.data && <div className="contract">{contract.data.termsText}</div>}
        </section>

        <PaymentCard booking={b} />
      </div>

      {invoices.data && invoices.data.length > 0 && (
        <section className="stack" aria-labelledby="invoices-title">
          <h2 id="invoices-title">Invoice &amp; receipt</h2>
          {invoices.data.map((inv) => (
            <InvoiceView key={inv.id} invoice={inv} />
          ))}
        </section>
      )}
    </div>
  );
}

function BalanceDue({
  booking: b,
  isOwner,
  retrying,
  onRetry,
  onPaid,
}: {
  booking: Booking;
  isOwner: boolean;
  retrying: boolean;
  onRetry: () => void;
  onPaid: () => void;
}) {
  const due = b.payment?.balanceDue ?? 0;
  // The balance PaymentIntent is created only when the customer chooses to pay online, not on every visit.
  const [payOnline, setPayOnline] = useState(false);
  return (
    <section className="card stack action-panel" aria-labelledby="balance-title">
      <div className="checkout-task__head">
        <h2 id="balance-title">Remaining balance due</h2>
        <span className="badge amber">Action needed</span>
      </div>
      <div className="checkout-amount">
        <span className="muted">Balance due</span>
        <strong className="price">{money(due)}</strong>
      </div>
      <div className="alert" role="alert">
        The rental ended {dateTime(b.endedAt)} (total {money(b.pendingTotalCost)}), but {money(due)} could not be charged
        {b.payment?.failureReason ? `: ${b.payment.failureReason}` : ''}. The rental stays open until it is paid.
      </div>
      <div className="row">
        <button onClick={onRetry} disabled={retrying || payOnline}>
          {retrying ? 'Retrying…' : 'Retry saved card'}
        </button>
        {isOwner && !payOnline && (
          <button className="primary" onClick={() => setPayOnline(true)} disabled={retrying}>
            Pay with another card
          </button>
        )}
      </div>
      {isOwner && payOnline && (
        <StripePayment
          bookingId={b.id}
          purpose="balance"
          amount={due}
          billingName={b.customer.fullName}
          billingEmail={b.customer.email}
          createIntent={() => api.post<PaymentIntent>(`/bookings/${encodeURIComponent(b.id)}/balance-intent`)}
          reload={() => api.get<Booking>(`/bookings/${encodeURIComponent(b.id)}`)}
          onSettled={onPaid}
        />
      )}
      <p className="muted small">The balance is shown as paid once Stripe confirms the payment to us.</p>
    </section>
  );
}

function PaymentCard({ booking: b }: { booking: Booking }) {
  const p = b.payment;
  return (
    <div className="card stack">
      <h2>Payment</h2>
      {!p && <p className="muted">No payment yet.</p>}
      {p && (
        <div className="row between">
          <div>
            <div>
              {paymentLabel(p.status)}
              {p.cardLast4 && <span className="muted small"> · card ****{p.cardLast4}</span>}
            </div>
            <div className="muted small">
              {p.paidAt ? dateTime(p.paidAt) : 'Not completed'}
              {p.failureReason && ` · ${p.failureReason}`}
            </div>
            {p.balanceDue != null && <div className="small">Balance due: {money(p.balanceDue)}</div>}
          </div>
          <div className="right">
            <div className="num">{money(p.amount)}</div>
            <StatusBadge status={p.status} />
          </div>
        </div>
      )}
    </div>
  );
}

function LiveTracking({ booking: b, reportLocation }: { booking: Booking; reportLocation: boolean }) {
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The rider's own browser reports its real location, only for their rental in progress (shouldReportLocation).
  const gps = useRiderGps(b.id, reportLocation);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<Tracking>(`/bookings/${encodeURIComponent(b.id)}/tracking`)
        .then((t) => !cancelled && setTracking(t))
        .catch((e) => !cancelled && setError(e.message));
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [b.id]);

  // Running estimate with the billing rule (pricing.ts mirrors PricingService): days and extra hours, GPS km above
  // the allowance, gear days.
  const elapsedMs = Date.now() - new Date(b.startTime).getTime();
  const hours = Math.max(1, Math.ceil(elapsedMs / 3_600_000));
  const km = tracking?.distanceKm ?? 0;
  const gearDays = chargedGearDays(elapsedMs);
  const gearCost = b.gear.reduce((sum, g) => sum + g.dailyRate * g.quantity * gearDays, 0);
  const chargeableKm = excessKm(km, scooterTime(elapsedMs).days);
  const estimate =
    scooterTimeCost(elapsedMs, b.scooter.dailyRate, b.scooter.hourlyRate) + chargeableKm * b.scooter.perKmRate + gearCost;
  const last = tracking?.trail[tracking.trail.length - 1];
  const p = tracking?.position;
  const live = liveState(p);
  const speed = speedState(last?.speedKmh, !!p?.stale);

  return (
    <section className="card stack live-rental" aria-labelledby="live-title">
      <div className="live-rental__head">
        <h2 id="live-title">Live rental</h2>
        <span className={`badge ${live.tone}`}>{live.label}</span>
      </div>
      <p className="live-rental__strip muted small">
        <span>Last update {dateTime(p?.lastSeen)}</span>
        <span>
          {b.scooter.model} ({b.scooter.plateNumber})
        </span>
      </p>
      <ErrorAlert error={error} />
      {gps && (
        <div className={`alert small ${gps === 'active' || gps === 'starting' ? 'info' : 'warning'}`} role="status">
          {GPS_STATUS_TEXT[gps]}
          {isTrackingOff(gps) && ' Your rental continues; distance is billed from the location reports received.'}
        </div>
      )}
      {speed.over && (
        <div className="alert warning" role="alert">
          <strong>Over the speed limit:</strong> your last reported speed was {speed.text}. Please slow down; the limit
          is {SPEED_LIMIT_KMH} km/h.
        </div>
      )}
      <div className="stats live-rental__tiles" aria-live="polite">
        <Stat label="Time so far" value={`${hours} h`} hint="Each started hour" />
        <Stat label="Distance (GPS)" value={`${km.toFixed(2)} km`} />
        <Stat label="Speed" value={speed.text} hint={speed.over ? `Over ${SPEED_LIMIT_KMH} km/h` : undefined} />
        <Stat label="Estimated total" value={money(estimate)} hint="Final total when you end the rental" />
      </div>
      {(p?.latitude == null || p.longitude == null) && tracking && (
        <p className="muted small">No location has been reported for this rental yet, so there is no map position to show.</p>
      )}
      {p?.latitude != null && p.longitude != null && (
        <MapView
          center={[p.latitude, p.longitude]}
          zoom={14}
          markers={[
            {
              id: p.scooterId,
              lat: p.latitude,
              lng: p.longitude,
              kind: p.stale ? 'STALE' : 'RENTED',
              popup: `${p.model} ${p.plateNumber}${p.stale ? ' (last known position)' : ''}`,
            },
          ]}
          trail={tracking?.trail.map((t) => [t.latitude, t.longitude] as [number, number])}
        />
      )}
      <p className="muted small">
        GPS logs your route for distance billing and helps us find you if you need roadside help. In an emergency,
        call our office. When you are back, use <strong>End rental</strong> at the top of this page.
      </p>
    </section>
  );
}
