import { ReactNode } from 'react';
import { STAGE_LABEL } from '../bookings';
import type { BookingStage, BookingStatus } from '../types';

// ─── ErrorAlert ──────────────────────────────────────────────────────────────

/**
 * Renders a red alert box when `error` is a non-empty string.
 * Renders nothing when error is null / undefined.
 */
export function ErrorAlert({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert" aria-live="assertive">
      {error}
    </div>
  );
}

// ─── Loading ─────────────────────────────────────────────────────────────────

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="muted">{what}…</p>;
}

// ─── FieldError ──────────────────────────────────────────────────────────────

/**
 * Small inline error message under a form field.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="field-error">{message}</span>;
}

// ─── Empty ───────────────────────────────────────────────────────────────────

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

// ─── StageBadge ──────────────────────────────────────────────────────────────

const STAGE_TONE: Record<BookingStage, string> = {
  AWAITING_PAYMENT: 'amber',
  PAYMENT_FAILED:   'red',
  UPCOMING:         'blue',
  IN_PROGRESS:      'green',
  BALANCE_DUE:      'amber',
  COMPLETED:        '',
  CANCELLED:        'red',
  REFUNDED:         '',
};

/** Shows the server-derived booking stage, with the SDS status as a tooltip. */
export function StageBadge({ stage, status }: { stage: BookingStage; status: BookingStatus }) {
  return (
    <span className={`badge ${STAGE_TONE[stage]}`} title={`Booking status: ${status}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

// ─── Stat ────────────────────────────────────────────────────────────────────

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

// ─── DetailRow ───────────────────────────────────────────────────────────────

/** One label/value pair inside a <dl>. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ─── LoadError ───────────────────────────────────────────────────────────────

/** Error alert with a retry button, for a failed data load. */
export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="load-error">
      <ErrorAlert error={error} />
      <button type="button" className="small" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
