import { useState } from 'react';
import { api } from '../api';
import { DEMO_BANNER, DEMO_HELP, DEMO_LABEL, DEMO_WARNING, type DemoAction } from '../demo';
import { parseEndOdometer } from '../handover';
import { useAction } from '../hooks';
import { useConfirm } from '../useConfirm';
import { useDemoMode } from '../useDemoMode';
import type { Booking } from '../types';
import { ErrorAlert } from './ui';

/** Shown above every page only while the backend runs in viva demo mode. */
export function DemoBanner() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note" id="viva-demo-banner">
      {DEMO_BANNER}
    </div>
  );
}

/** Admin-only viva demo controls on a booking; the caller decides which actions apply (see demo.ts). */
export function DemoControls({
  booking: b,
  actions,
  blocker,
  onChanged,
}: {
  booking: Booking;
  actions: DemoAction[];
  blocker: string;
  onChanged: () => void;
}) {
  const action = useAction();
  const { confirm, dialog } = useConfirm();
  // Ending a demo rental needs the ending odometer, like any rental.
  const [reading, setReading] = useState('');
  const ending = parseEndOdometer(reading, b.startOdometerKm);
  if (actions.length === 0 && !blocker) return null;

  const run = async (a: DemoAction) => {
    if (a === 'end' && ending.error !== undefined) {
      action.setError(ending.error);
      return;
    }
    const ok = await confirm({
      title: `${DEMO_LABEL[a]}?`,
      message: `${DEMO_HELP[a]} ${DEMO_WARNING}`,
      confirmLabel: DEMO_LABEL[a],
      cancelLabel: 'Go back',
      destructive: a === 'close',
    });
    if (!ok) return;
    const path = `/admin/demo/bookings/${encodeURIComponent(b.id)}/${a}`;
    const body = a === 'end' ? { endOdometerKm: ending.value } : undefined;
    if (await action.run(() => api.post<Booking>(path, body).then(() => true))) onChanged();
  };

  return (
    <section className="card stack demo-panel" aria-labelledby="demo-title">
      {dialog}
      <div className="checkout-task__head">
        <h2 id="demo-title">Viva demo controls</h2>
        <span className="badge amber">Demo only</span>
      </div>
      <div className="alert warning" role="note">
        {DEMO_WARNING}
      </div>
      {blocker && <p className="muted">{blocker}</p>}
      {actions.map((a) => (
        <div key={a} className="demo-panel__action">
          <p className="muted small">{DEMO_HELP[a]}</p>
          {a === 'end' && (
            <label>
              Ending odometer (km){b.startOdometerKm != null && ` · started at ${b.startOdometerKm} km`}
              <input
                id="demo-end-odometer"
                inputMode="decimal"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
              />
            </label>
          )}
          <button
            id={`btn-demo-${a}`}
            className={a === 'close' ? 'danger' : 'primary'}
            onClick={() => run(a)}
            disabled={action.busy}
          >
            {DEMO_LABEL[a]}
          </button>
        </div>
      ))}
      <ErrorAlert error={action.error} />
    </section>
  );
}
