import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BackLink } from '../components/BackLink';
import { BookingStepper } from '../components/BookingStepper';
import { BookingTimeline } from '../components/BookingTimeline';
import { DemoControls } from '../components/DemoMode';
import { RepairPanel } from '../components/RepairPanel';
import { TransferPanel } from '../components/TransferPanel';
import { useConfirm } from '../useConfirm';
import { StripePayment } from '../components/StripePayment';
import InvoiceView from '../components/InvoiceView';
import MapView from '../components/MapView';
import { DetailRow, ErrorAlert, Loading, StageBadge, Stat, StatusBadge } from '../components/ui';
import {
  CASH_CANCEL_NOTE,
  CASH_END_NOTE,
  CASH_PENDING_NOTE,
  cashAction,
  cashConfirmPath,
  cashPaymentLabel,
  invoiceReimbursement,
  isCashBooking,
} from '../cash';
import { paymentLabel } from '../checkout';
import {
  isTransferBooking,
  isTransferMethod,
  PAYMENT_METHOD_LABEL,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  TRANSFER_CANCEL_NOTE,
  TRANSFER_END_NOTE,
  TRANSFER_LABEL,
  transferPaymentLabel,
} from '../transfers';
import { DEMO_RENTAL_NOTE, demoActions, demoBlocker, isDemoRental } from '../demo';
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
import { UNRESOLVED_REPAIRS_ADMIN, UNRESOLVED_REPAIRS_CUSTOMER, unresolvedReimbursements } from '../repairs';
import { liveState, SPEED_LIMIT_KMH, speedState, STAGE_HELP } from '../rental';
import { adminGpsHistoryPath, checkoutPath } from '../routes';
import { useDemoMode } from '../useDemoMode';
import { useRiderGps } from '../useRiderGps';
import { excessKm, gearDays as chargedGearDays, INCLUDED_KM_PER_DAY, scooterTime, scooterTimeCost } from '../pricing';
import { isAdmin } from '../types';
import type { Booking, BookingStage, Contract, Invoice, PaymentIntent, RepairReport, Tracking } from '../types';

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
  // Unresolved self-arranged repair reports hold back the final bill (the backend refuses to end the rental).
  const repairs = useLoad(() => api.get<RepairReport[]>(`${bookingApi}/repairs`), [id]);
  const [showContract, setShowContract] = useState(false);
  const contract = useLoad(
    () => (showContract ? api.get<Contract>(`${bookingApi}/contract`) : Promise.resolve(null)),
    [id, showContract],
  );
  const inAdmin = useLocation().pathname.startsWith('/admin');
  const cancel = useAction();
  const end = useAction();
  const { confirm, dialog } = useConfirm();
  const paymentReturn = usePaymentReturn(id, booking.setData, invoices.reload);
  const demoMode = useDemoMode();

  if (booking.loading) return <Loading />;
  if (!booking.data) return <ErrorAlert error={booking.error} />;
  const b = booking.data;
  const isOwner = user?.id === b.customer.id;
  const canCancel = b.stage === 'AWAITING_PAYMENT' || b.stage === 'PAYMENT_FAILED' || b.stage === 'UPCOMING';
  // A viva demo rental has no payment to settle against: only the admin demo controls end it.
  const demoRental = isDemoRental(b);
  const canEnd = b.stage === 'IN_PROGRESS' && (isOwner || isAdmin(user?.role)) && !demoRental;
  // Cash at the rental counter: nothing moves through the card provider, and only an admin records the cash.
  const cash = isCashBooking(b);
  const cashPending = cash && b.status === 'PENDING' && b.payment?.status === 'PENDING';
  // QR Pay or bank transfer: the customer transfers outside the app and an admin approves the receipt.
  const transfer = isTransferBooking(b);
  const transferPending = transfer && b.status === 'PENDING' && b.payment?.status === 'PENDING';

  const openRepairs = unresolvedReimbursements(repairs.data ?? []);

  const refresh = () => {
    booking.reload();
    invoices.reload();
    repairs.reload();
  };

  const doCancel = async () => {
    const msg =
      b.status === 'ACTIVE'
        ? cash
          ? CASH_CANCEL_NOTE
          : transfer
            ? TRANSFER_CANCEL_NOTE
            : 'Cancel this booking? You will receive a full refund.'
        : 'Cancel this reservation?';
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
      message: cash
        ? CASH_END_NOTE
        : transfer
          ? TRANSFER_END_NOTE
          : 'The final total is calculated and the balance charged to your card.',
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
      {/* Admins reach this page under /admin, customers under /bookings: go back to the matching list. */}
      <BackLink fallback={inAdmin ? '/admin/bookings' : '/bookings'} label="All bookings" />
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
          <p className="booking-header__help">{demoRental ? DEMO_RENTAL_NOTE : STAGE_HELP[b.stage]}</p>
          <p className="muted small">
            {b.scooter.model} ({b.scooter.plateNumber}) · {b.pickupLocation}
          </p>
        </div>
        <div className="booking-header__actions">
          {b.status === 'PENDING' && isOwner && (
            <Link className="btn primary" to={checkoutPath(b.id)}>
              {b.stage === 'PAYMENT_FAILED'
                ? 'Try payment again'
                : cashPending || transferPending
                  ? 'Payment options'
                  : 'Sign & pay'}
            </Link>
          )}
          {canEnd && (
            <button className="primary booking-header__end" onClick={doEnd} disabled={end.busy || openRepairs.length > 0}>
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

      {canEnd && openRepairs.length > 0 && (
        <div className="alert warning" role="status">
          {inAdmin ? UNRESOLVED_REPAIRS_ADMIN : UNRESOLVED_REPAIRS_CUSTOMER}
          {inAdmin && (
            <>
              {' '}
              <Link to="/admin/repairs">Open Repairs</Link>
            </>
          )}
        </div>
      )}

      {inAdmin && (
        <DemoControls
          booking={b}
          actions={demoActions(b, demoMode, isAdmin(user?.role))}
          blocker={demoBlocker(b, demoMode, isAdmin(user?.role))}
          onChanged={refresh}
        />
      )}

      {cash && (
        <CashPanel
          booking={b}
          invoice={invoices.data?.find((i) => i.kind === 'FINAL')}
          admin={inAdmin && isAdmin(user?.role)}
          onChanged={refresh}
        />
      )}
      {(cash || transfer) && (
        <TransferPanel
          booking={b}
          invoice={invoices.data?.find((i) => i.kind === 'FINAL')}
          admin={inAdmin && isAdmin(user?.role)}
          onChanged={refresh}
        />
      )}

      <ErrorAlert error={cancel.error} />
      {b.stage === 'PAYMENT_FAILED' && b.payment?.failureReason && (
        <div className="alert" role="alert">
          Payment failed: {b.payment.failureReason}
        </div>
      )}
      {b.stage === 'UPCOMING' && (
        <div className="alert info">
          Paid{cash && ' in cash'}
          {transfer && ' by transfer'}. Your rental starts {dateTime(b.startTime)}. You can cancel for a full refund
          {cash && ', handed back in cash at the counter,'}
          {transfer && ', sent back to you by our team,'} until then.
        </div>
      )}

      {b.stage === 'BALANCE_DUE' && demoRental && (
        <DemoSettlement booking={b} invoice={invoices.data?.find((i) => i.kind === 'FINAL')} />
      )}
      {b.stage === 'BALANCE_DUE' && !demoRental && (
        <BalanceDue booking={b} isOwner={isOwner} retrying={end.busy} onRetry={doEnd} onPaid={refresh} />
      )}
      {b.stage !== 'BALANCE_DUE' && <ErrorAlert error={end.error} />}

      {b.stage === 'IN_PROGRESS' && <LiveTracking booking={b} reportLocation={shouldReportLocation(b, user?.id)} />}

      {/* The rider reports repairs on their own rental in progress and follows earlier reports. */}
      {isOwner && <RepairPanel bookingId={b.id} canReport={b.stage === 'IN_PROGRESS'} />}

      {inAdmin && (b.status === 'ACTIVE' || b.status === 'COMPLETED') && (
        <p>
          <Link to={adminGpsHistoryPath(b.id)}>View this rental&apos;s GPS history</Link>
        </p>
      )}

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
            <DetailRow
              label={
                demoRental
                  ? 'Initial charge'
                  : cash
                    ? 'Paid at booking (cash)'
                    : transfer
                      ? 'Paid at booking (transfer)'
                      : 'Charged at booking'
              }
            >
              {money(b.initialCharge)}{' '}
              {demoRental
                ? '(not charged: no payment was taken for this viva demo rental)'
                : cash
                  ? '(the one-hour minimum + 1 day of gear; the rest is paid in cash when the rental ends)'
                  : transfer
                    ? '(the one-hour minimum + 1 day of gear; the rest is paid by transfer or at the counter when the rental ends)'
                    : '(the one-hour minimum + 1 day of gear; the rest is charged when the rental ends)'}
            </DetailRow>
            {(b.totalCost ?? b.pendingTotalCost) != null && (
              <DetailRow label="Final total">
                <strong>{money(b.totalCost ?? b.pendingTotalCost)}</strong>
                {b.totalCost == null && (
                  <span className="muted small">{demoRental ? ' (calculated, not charged)' : ' (balance due)'}</span>
                )}
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
  // A cash balance is paid at the counter, never online: the CashPanel shows it.
  if (isCashBooking(b)) return null;
  // A transfer balance is paid by QR or bank transfer with a receipt: the TransferPanel shows it.
  if (isTransferBooking(b)) return null;
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

/**
 * Cash at the rental counter: the cash due before the booking is confirmed, or at the end the adjusted final total
 * (rental subtotal less any approved repair reimbursement) against the cash received, with the cash balance due or
 * the cash to hand back. An admin gets the one confirmation that applies; a customer never does.
 */
function CashPanel({
  booking: b,
  invoice,
  admin,
  onChanged,
}: {
  booking: Booking;
  invoice?: Invoice;
  admin: boolean;
  onChanged: () => void;
}) {
  const record = useAction();
  const { confirm, dialog } = useConfirm();
  const p = b.payment;
  if (!p) return null;
  const pending = b.status === 'PENDING' && p.status === 'PENDING';
  const settling = b.status === 'ACTIVE' && b.endedAt != null;
  const refundAfterCancel = b.status === 'CANCELLED' && p.refundDue != null;
  if (!pending && !settling && !refundAfterCancel) return null;
  const action = cashAction(b, admin);
  const reimbursement = invoice ? invoiceReimbursement(invoice) : 0;
  const title = pending ? 'Cash payment pending' : p.refundDue != null ? 'Cash refund due' : 'Cash balance due';

  const doConfirm = async () => {
    if (!action) return;
    const ok = await confirm({
      title: action.title,
      message: action.message,
      confirmLabel: action.label,
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    const done = await record.run(() => api.post<Booking>(cashConfirmPath(b.id, action.step), { amount: action.amount }));
    if (done) onChanged();
  };

  return (
    <section className="card stack action-panel" aria-labelledby="cash-title">
      {dialog}
      <div className="checkout-task__head">
        <h2 id="cash-title">{title}</h2>
        <span className="badge amber">{admin ? 'Action needed' : 'At the rental counter'}</span>
      </div>
      {pending && (
        <>
          <div className="checkout-amount">
            <span className="muted">Cash due now</span>
            <strong className="price">{money(p.amount)}</strong>
          </div>
          <p className="small">{CASH_PENDING_NOTE}</p>
        </>
      )}
      {settling && (
        <dl className="small cash-bill">
          {invoice && <DetailRow label="Rental subtotal">{money(invoice.subtotal)}</DetailRow>}
          {reimbursement > 0 && <DetailRow label="Approved repair reimbursement">−{money(reimbursement)}</DetailRow>}
          <DetailRow label="Final total">{money(b.pendingTotalCost)}</DetailRow>
          <DetailRow label="Cash received">{money(p.amount)}</DetailRow>
          {p.balanceDue != null && (
            <DetailRow label="Cash balance due">
              <strong>{money(p.balanceDue)}</strong>
            </DetailRow>
          )}
          {p.refundDue != null && (
            <DetailRow label="Cash refund due">
              <strong>{money(p.refundDue)}</strong>
            </DetailRow>
          )}
        </dl>
      )}
      {refundAfterCancel && (
        <div className="checkout-amount">
          <span className="muted">Cash refund due</span>
          <strong className="price">{money(p.refundDue)}</strong>
        </div>
      )}
      <p className="small">
        Payment method: <strong>Cash</strong>
        {!admin && settling && p.balanceDue != null && ' · Pay the cash balance at the rental counter; the rental is completed once an administrator records it.'}
        {!admin && p.refundDue != null && ' · The cash is handed back to you at the rental counter.'}
      </p>
      {action && (
        <div className="stack">
          <ErrorAlert error={record.error} />
          <div className="row">
            <span className="small">
              {action.dueLabel}: <strong>{money(action.amount)}</strong>
            </span>
            <button className="primary" onClick={doConfirm} disabled={record.busy}>
              {record.busy ? 'Recording…' : action.label}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The ended viva demo rental: the final bill from the normal pricing rules, clearly not charged. */
function DemoSettlement({ booking: b, invoice }: { booking: Booking; invoice?: Invoice }) {
  const reimbursement = invoice ? invoice.subtotal - invoice.total : 0;
  return (
    <section className="card stack action-panel" aria-labelledby="demo-bill-title">
      <div className="checkout-task__head">
        <h2 id="demo-bill-title">Final bill calculated</h2>
        <span className="badge amber">Not charged</span>
      </div>
      <div className="checkout-amount">
        <span className="muted">Calculated final total</span>
        <strong className="price">{money(b.pendingTotalCost)}</strong>
      </div>
      {invoice && (
        <dl className="small demo-bill">
          <DetailRow label="Rental subtotal">{money(invoice.subtotal)}</DetailRow>
          {reimbursement > 0 && (
            <DetailRow label="Approved repair reimbursement">−{money(reimbursement)}</DetailRow>
          )}
          <DetailRow label="Adjusted final total">{money(invoice.total)}</DetailRow>
          <DetailRow label="Payment">Not charged — viva demo</DetailRow>
        </dl>
      )}
      <p className="small">
        The rental ended {dateTime(b.endedAt)}. The total uses the normal pricing rules; the final invoice below shows
        each line.
      </p>
      <div className="alert info" role="note">
        No payment was taken: this is a viva demo rental, so the amount was calculated but not charged.
      </div>
    </section>
  );
}

function PaymentCard({ booking: b }: { booking: Booking }) {
  const p = b.payment;
  return (
    <div className="card stack">
      <h2>Payment</h2>
      {!p && <p className="muted">{isDemoRental(b) ? 'No payment taken (viva demo rental).' : 'No payment yet.'}</p>}
      {p && (
        <div className="row between">
          <div>
            <div>
              {isTransferMethod(p.method) ? (
                transferPaymentLabel(p)
              ) : (
                <>{p.method === 'CASH' ? cashPaymentLabel(p.status) : paymentLabel(p.status)}</>
              )}
              {p.method === 'CASH' && <span className="muted small"> · Cash at the rental counter</span>}
              {p.cardLast4 && <span className="muted small"> · card ****{p.cardLast4}</span>}
            </div>
            <div className="muted small">
              {p.paidAt ? dateTime(p.paidAt) : 'Not completed'}
              {p.failureReason && ` · ${p.failureReason}`}
            </div>
            {p.balanceDue != null && <div className="small">Balance due: {money(p.balanceDue)}</div>}
            {p.refundDue != null && (
              <div className="small">
                {p.method === 'CASH' ? 'Cash refund due' : 'Refund due (not yet refunded)'}: {money(p.refundDue)}
              </div>
            )}
            <div className="muted small">Method: {PAYMENT_METHOD_LABEL[p.method]}</div>
          </div>
          <div className="right">
            <div className="num">{money(p.amount)}</div>
            <StatusBadge status={p.status} />
          </div>
        </div>
      )}
      {p && p.receipts.length > 0 && (
        <div className="stack">
          <h3 className="small">Transfer receipts</h3>
          <ul className="receipt-history small">
            {p.receipts.map((r) => (
              <li key={r.id}>
                <span className={`badge ${RECEIPT_STATUS_TONE[r.status]}`}>{RECEIPT_STATUS_LABEL[r.status]}</span>{' '}
                {TRANSFER_LABEL[r.method]} · {r.kind === 'INITIAL' ? 'initial payment' : 'final balance'} ·{' '}
                {money(r.amount)}
                <div className="muted">
                  Submitted {dateTime(r.submittedAt)}
                  {r.status === 'APPROVED' && ` · approved ${dateTime(r.reviewedAt)}`}
                  {r.status === 'REJECTED' && ` · rejected ${dateTime(r.reviewedAt)}: ${r.rejectionReason}`}
                  {r.transferReference && ` · reference ${r.transferReference}`}
                </div>
              </li>
            ))}
          </ul>
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
        <Stat label="Estimated total" value={money(estimate)} hint="Before any approved repair reimbursement" />
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
