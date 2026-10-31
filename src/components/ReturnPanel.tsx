import { useState } from 'react';
import { api } from '../api';
import { dateTime } from '../format';
import { completePath, odometerDistance, ODOMETER_BILLING_NOTE, parseEndOdometer } from '../handover';
import { useAction } from '../hooks';
import type { Booking } from '../types';
import { useConfirm } from '../useConfirm';
import { DetailRow, ErrorAlert } from './ui';

/**
 * Admin: the scooter is back. The ending odometer is required before the final bill is calculated; the billed
 * distance is ending minus starting. Once the bill is calculated the readings can no longer change.
 */
export function ReturnPanel({
  booking: b,
  endNote,
  blockedReason,
  onChanged,
}: {
  booking: Booking;
  /** How the balance is settled for this payment method. */
  endNote: string;
  /** Why the final bill cannot be calculated yet (unresolved repair reports), or null. */
  blockedReason: string | null;
  onChanged: () => void;
}) {
  const blocked = blockedReason != null;
  const [reading, setReading] = useState('');
  const [touched, setTouched] = useState(false);
  const end = useAction();
  const { confirm, dialog } = useConfirm();
  // Rentals started before odometer readings were recorded are billed by their GPS distance and need none.
  const needsReading = b.startOdometerKm != null;
  const parsed = needsReading ? parseEndOdometer(reading, b.startOdometerKm) : null;
  const distance = parsed?.value !== undefined ? odometerDistance(b.startOdometerKm, parsed.value) : null;

  const submit = async () => {
    setTouched(true);
    if (parsed && parsed.error !== undefined) return;
    const ok = await confirm({
      title: `End ${b.reference}?`,
      message: needsReading
        ? `Ending odometer ${parsed?.value} km: ${distance} km travelled. The final bill is calculated now and ` +
          `the readings cannot be changed afterwards. ${endNote}`
        : `This rental started before odometer readings were recorded, so its distance comes from GPS. ${endNote}`,
      confirmLabel: 'End rental & calculate final bill',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    await end.run(() =>
      api.put<Booking>(completePath(b.id), needsReading ? { endOdometerKm: parsed?.value } : {}),
    );
    onChanged();
  };

  return (
    <section className="card stack action-panel" aria-labelledby="return-title">
      {dialog}
      <div className="checkout-task__head">
        <h2 id="return-title">Return the scooter</h2>
        <span className="badge green">Rental in progress</span>
      </div>
      <dl className="small">
        {b.actualStartTime && <DetailRow label="Rental started">{dateTime(b.actualStartTime)}</DetailRow>}
        <DetailRow label="Starting odometer">
          {needsReading ? `${b.startOdometerKm} km` : 'Not recorded (started before odometer readings)'}
        </DetailRow>
        {needsReading && (
          <DetailRow label="Actual distance travelled">{distance != null ? `${distance} km` : '—'}</DetailRow>
        )}
      </dl>
      {needsReading && (
        <>
          <p className="small">{ODOMETER_BILLING_NOTE}</p>
          <label>
            Ending odometer (km)
            <input
              id="end-odometer"
              inputMode="decimal"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && parsed?.error !== undefined}
            />
          </label>
          {touched && parsed?.error !== undefined && (
            <p className="field-error small" role="alert">
              {parsed.error}
            </p>
          )}
        </>
      )}
      {blockedReason && (
        <div className="alert warning" role="status">
          {blockedReason}
        </div>
      )}
      {/* The backend's reason when it refuses (400/409/402) stays on screen: the page keeps this panel on reload. */}
      <ErrorAlert error={end.error} />
      <div>
        <button
          id="btn-end-rental"
          className="primary"
          onClick={submit}
          disabled={end.busy || blocked || (needsReading && !reading.trim())}
        >
          {end.busy ? 'Ending rental…' : 'End rental & calculate final bill'}
        </button>
      </div>
    </section>
  );
}
