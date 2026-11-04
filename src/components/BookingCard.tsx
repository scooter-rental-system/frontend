import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { needsAction } from '../bookings';
import { dateTime, humanize, money } from '../format';
import { cardAction } from '../rental';
import { bookingActionPath } from '../routes';
import { isTransferMethod, PAYMENT_METHOD_LABEL } from '../transfers';
import type { Booking } from '../types';
import { DetailRow, ScooterIllustration, StageBadge } from './ui';

/** What the customer has paid or owes, depending on where the booking is. */
function amountLine(b: Booking): string {
  if (b.totalCost != null) return `Total ${money(b.totalCost)}`;
  if (b.stage === 'BALANCE_DUE' && b.payment?.balanceDue != null) return `Balance due ${money(b.payment.balanceDue)}`;
  if (b.payment?.status === 'SUCCESS') return `Paid ${money(b.payment.amount)}`;
  if (b.payment?.status === 'REFUNDED') return `Refunded ${money(b.payment.amount)}`;
  if (b.status === 'CANCELLED') return 'Not charged';
  return `Initial charge ${money(b.initialCharge)}`;
}

export function BookingCard({ booking: b }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const action = cardAction(b);

  return (
    <li className="booking-card">
      <div className="booking-card__main">
        <span className="booking-card__tile" aria-hidden>
          <ScooterIllustration />
        </span>
        <div className="booking-card__info">
          <div className="booking-card__title">
            <strong>{b.scooter.model}</strong>
            <StageBadge stage={b.stage} status={b.status} />
          </div>
          <div className="muted small">
            {b.reference} · {b.scooter.plateNumber} ·{' '}
            {b.actualStartTime ? `Started ${dateTime(b.actualStartTime)}` : `Pickup ${dateTime(b.startTime)}`}
          </div>
          {needsAction(b) && (
            <div className="booking-card__action small">
              {b.stage === 'BALANCE_DUE' ? 'Please settle the remaining balance.' : 'Payment needed to confirm this booking.'}
            </div>
          )}
        </div>
        <div className="booking-card__side">
          <span className="small booking-card__amount">{amountLine(b)}</span>
          <div className="booking-card__buttons">
            <button
              type="button"
              className="small ghost"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Hide details' : 'Details'}
            </button>
            <Link className={`btn small${action.primary ? ' primary' : ''}`} to={bookingActionPath(action.target, b.id)}>
              {action.label}
              <span className="sr-only"> for booking {b.reference}</span>
            </Link>
          </div>
        </div>
      </div>

      {open && (
        <dl id={detailsId} className="booking-card__details small">
          <DetailRow label="Booking status">{humanize(b.status)}</DetailRow>
          <DetailRow label="Scooter">
            {b.scooter.model} ({b.scooter.code}, {b.scooter.plateNumber})
          </DetailRow>
          <DetailRow label="Rates">
            {money(b.scooter.dailyRate)} / day · {money(b.scooter.hourlyRate)} / extra hour ·{' '}
            {money(b.scooter.perKmRate)} / km above the included distance
          </DetailRow>
          <DetailRow label="Pickup">{b.pickupLocation}</DetailRow>
          {b.dropLocation && <DetailRow label="Drop-off">{b.dropLocation}</DetailRow>}
          <DetailRow label="Planned pickup">{dateTime(b.startTime)}</DetailRow>
          {b.actualStartTime && <DetailRow label="Rental started">{dateTime(b.actualStartTime)}</DetailRow>}
          {(b.endTime ?? b.endedAt) && <DetailRow label="Ended">{dateTime(b.endTime ?? b.endedAt)}</DetailRow>}
          {b.cancelledAt && <DetailRow label="Cancelled">{dateTime(b.cancelledAt)}</DetailRow>}
          {b.billableHours != null && <DetailRow label="Billable hours">{b.billableHours}</DetailRow>}
          {(b.distanceKm ?? b.pendingDistanceKm) != null && (
            <DetailRow label="Distance">{b.distanceKm ?? b.pendingDistanceKm} km</DetailRow>
          )}
          {b.gear.length > 0 && (
            <DetailRow label="Gear">
              {b.gear.map((g) => `${g.quantity} × ${g.name} (${money(g.dailyRate)}/day)`).join(', ')}
            </DetailRow>
          )}
          <DetailRow label="Initial charge">{money(b.initialCharge)}</DetailRow>
          {b.totalCost != null && <DetailRow label="Total cost">{money(b.totalCost)}</DetailRow>}
          {b.totalCost == null && b.pendingTotalCost != null && (
            <DetailRow label="Final total">{money(b.pendingTotalCost)}</DetailRow>
          )}
          <DetailRow label="Payment">
            {b.payment ? (
              <>
                {humanize(b.payment.status)} · {money(b.payment.amount)}
                {b.payment.method === 'CASH' && ' · cash'}
                {isTransferMethod(b.payment.method) && ` · ${PAYMENT_METHOD_LABEL[b.payment.method]}`}
                {b.payment.cardLast4 && ` · card ending ${b.payment.cardLast4}`}
                {b.payment.balanceDue != null && b.payment.balanceDue > 0 && ` · balance due ${money(b.payment.balanceDue)}`}
                {b.payment.refundDue != null &&
                  ` · ${b.payment.method === 'CASH' ? 'cash ' : ''}refund due ${money(b.payment.refundDue)}`}
                {b.payment.failureReason && <div className="field-error">{b.payment.failureReason}</div>}
              </>
            ) : (
              'Not paid yet'
            )}
          </DetailRow>
          <DetailRow label="Contract">{b.contractSigned ? 'Signed' : 'Not signed'}</DetailRow>
          {b.notes && <DetailRow label="Notes">{b.notes}</DetailRow>}
          <DetailRow label="Booked on">{dateTime(b.createdAt)}</DetailRow>
        </dl>
      )}
    </li>
  );
}

/** Placeholder cards while bookings load; the label is announced once, the shapes are hidden from screen readers. */
export function BookingListSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div className="booking-skeleton">
      <p className="sr-only" role="status">
        {label}…
      </p>
      <ul className="booking-list" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="booking-card booking-card--skeleton">
            <div className="booking-card__main">
              <span className="booking-card__tile skeleton" />
              <div className="booking-card__info" style={{ flex: 1 }}>
                <div className="skeleton skeleton--line" style={{ width: '45%' }} />
                <div className="skeleton skeleton--line" style={{ width: '70%' }} />
              </div>
              <div className="skeleton skeleton--button" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BookingList({ bookings }: { bookings: Booking[] }) {
  return (
    <ul className="booking-list">
      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} />
      ))}
    </ul>
  );
}
