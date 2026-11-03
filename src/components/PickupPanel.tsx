import { useState } from 'react';
import { api } from '../api';
import { dateTime, money } from '../format';
import {
  CONFIRM_START_MESSAGE,
  CONFIRM_START_TITLE,
  HANDOVER_WAITING_CUSTOMER,
  handoverPath,
  ODOMETER_BILLING_NOTE,
  parseOdometer,
  pickupStep,
  READY_FOR_PICKUP_NOTE,
  startPath,
} from '../handover';
import { useAction } from '../hooks';
import type { Booking } from '../types';
import { useConfirm } from '../useConfirm';
import { DetailRow, ErrorAlert } from './ui';

/**
 * A paid booking waiting for pickup. The admin hands the scooter over with its starting odometer; the customer then
 * confirms the start, which starts the rental. Neither can do the other's step: the backend refuses it too.
 */
export function PickupPanel({
  booking: b,
  admin,
  owner,
  onChanged,
}: {
  booking: Booking;
  admin: boolean;
  owner: boolean;
  onChanged: () => void;
}) {
  const step = pickupStep(b, { admin, owner });
  if (!step) return null;
  return (
    <section className="card stack action-panel" aria-labelledby="pickup-title">
      <div className="checkout-task__head">
        <h2 id="pickup-title">
          {step === 'handover'
            ? 'Hand over the scooter'
            : step === 'confirm-start'
              ? CONFIRM_START_TITLE
              : step === 'waiting-customer'
                ? 'Handover confirmed'
                : 'Ready for pickup'}
        </h2>
        <span className={`badge ${step === 'handover' || step === 'confirm-start' ? 'amber' : 'blue'}`}>
          {step === 'handover' || step === 'confirm-start' ? 'Action needed' : 'Not started'}
        </span>
      </div>
      <dl className="small">
        <DetailRow label="Planned pickup">
          {dateTime(b.startTime)} · {b.pickupLocation}
        </DetailRow>
        <DetailRow label="Scooter">
          {b.scooter.code} · {b.scooter.model} ({b.scooter.plateNumber})
        </DetailRow>
        {admin && <DetailRow label="Customer">{b.customer.fullName}</DetailRow>}
        {admin && b.payment && (
          <DetailRow label="Payment">
            {b.payment.status === 'SUCCESS' ? 'Received' : b.payment.status} · {money(b.payment.amount)}
          </DetailRow>
        )}
        {b.handoverConfirmedAt && (
          <DetailRow label="Handed over">
            {dateTime(b.handoverConfirmedAt)}
            {b.handoverConfirmedBy && ` by ${b.handoverConfirmedBy}`} · starting odometer {b.startOdometerKm} km
          </DetailRow>
        )}
      </dl>
      {step === 'handover' && <HandoverForm booking={b} onChanged={onChanged} />}
      {step === 'waiting-customer' && (
        <div className="alert info" role="status">
          {HANDOVER_WAITING_CUSTOMER}
        </div>
      )}
      {step === 'waiting-handover' && <p className="small">{READY_FOR_PICKUP_NOTE}</p>}
      {step === 'confirm-start' && <ConfirmStart booking={b} onChanged={onChanged} />}
    </section>
  );
}

/** Admin: the starting odometer is required before the handover can be confirmed. */
function HandoverForm({ booking: b, onChanged }: { booking: Booking; onChanged: () => void }) {
  const [reading, setReading] = useState('');
  const [touched, setTouched] = useState(false);
  const record = useAction();
  const { confirm, dialog } = useConfirm();
  const parsed = parseOdometer(reading, 'starting');

  const submit = async () => {
    setTouched(true);
    if (parsed.error !== undefined) return;
    const ok = await confirm({
      title: 'Confirm scooter handover?',
      message:
        `Hand ${b.scooter.code} over to ${b.customer.fullName} with the odometer at ${parsed.value} km. The rental ` +
        'starts only when the customer then confirms the start. The reading cannot be changed afterwards.',
      confirmLabel: 'Confirm Scooter Handover',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (await record.run(() => api.post<Booking>(handoverPath(b.id), { startOdometerKm: parsed.value }))) {
      onChanged();
    }
  };

  return (
    <div className="stack">
      {dialog}
      <p className="small">
        Check the scooter with the customer, read its odometer and confirm the handover. {ODOMETER_BILLING_NOTE}
      </p>
      <label>
        Starting odometer (km)
        <input
          id="start-odometer"
          inputMode="decimal"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && parsed.error !== undefined}
        />
      </label>
      {touched && parsed.error !== undefined && (
        <p className="field-error small" role="alert">
          {parsed.error}
        </p>
      )}
      <ErrorAlert error={record.error} />
      <div>
        <button id="btn-confirm-handover" className="primary" onClick={submit} disabled={record.busy || !reading.trim()}>
          {record.busy ? 'Confirming…' : 'Confirm Scooter Handover'}
        </button>
      </div>
    </div>
  );
}

/** Customer: confirming starts the rental (server time), the ACTIVE booking and location monitoring. */
function ConfirmStart({ booking: b, onChanged }: { booking: Booking; onChanged: () => void }) {
  const start = useAction();
  const { confirm, dialog } = useConfirm();
  const submit = async () => {
    const ok = await confirm({
      title: `${CONFIRM_START_TITLE}?`,
      message: CONFIRM_START_MESSAGE,
      confirmLabel: 'Start my rental',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (await start.run(() => api.post<Booking>(startPath(b.id)))) onChanged();
  };
  return (
    <div className="stack">
      {dialog}
      <p className="small">
        Our team has handed the scooter over. Confirm the start once you have it. Confirming starts:
      </p>
      <ul className="small">
        <li>the rental timer: you are billed from the moment you confirm;</li>
        <li>your active rental;</li>
        <li>location monitoring on this page, if your browser allows it.</li>
      </ul>
      <ErrorAlert error={start.error} />
      <div>
        <button id="btn-confirm-start" className="primary" onClick={submit} disabled={start.busy}>
          {start.busy ? 'Starting…' : 'Confirm Rental Start'}
        </button>
      </div>
    </div>
  );
}
