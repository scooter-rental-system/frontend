import { ReactNode } from 'react';
import { STAGE_LABEL } from '../bookings';
import { humanize } from '../format';
import type { BookingStage, BookingStatus } from '../types';

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: 'green',
  PAID: 'green',
  SUCCESS: 'green',
  DONE: 'green',
  SENT: 'green',
  ACTIVE: 'blue',
  RENTED: 'blue',
  IN_PROGRESS: 'blue',
  PENDING: 'amber',
  MAINTENANCE: 'amber',
  SCHEDULED: 'amber',
  ISSUED: 'amber',
  CANCELLED: 'red',
  FAILED: 'red',
  REFUNDED: 'red',
  VOID: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{humanize(status)}</span>;
}

export function ErrorAlert({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert" aria-live="assertive">
      {error}
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="muted">{what}…</p>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="field-error">{message}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

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
    <span className={`badge ${STAGE_TONE[stage] ?? ''}`} title={`Booking status: ${status}`}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__label label">{label}</div>
      <div className="stat__value value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

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

/** The Scooter Rent Kandy logo mark: a charcoal scooter on a gold tile (same artwork as public/scooter.svg). */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="8" fill="#b8860b" />
      <g fill="none" stroke="#16181d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 8h3l-3 14" />
        <path d="M9 22h11" />
      </g>
      <g fill="#16181d">
        <circle cx="9" cy="23" r="3" />
        <circle cx="22.5" cy="23" r="3" />
      </g>
    </svg>
  );
}

/** Placeholder artwork for a scooter without a photo: a line drawing in the current text colour. */
export function ScooterIllustration() {
  return (
    <svg viewBox="0 0 96 60" aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="46" r="9" />
        <circle cx="76" cy="46" r="9" />
        <path d="M11 40c0-10 8-16 20-15l9 1" />
        <path d="M20 22h16" />
        <path d="M33 40h30" />
        <path d="M63 40 70 14" />
        <path d="M64 14h12" />
        <path d="M66 40c2-5 7-7 12-6" />
      </g>
    </svg>
  );
}

export function ScooterThumb({ imageUrl, alt }: { imageUrl: string | null; alt: string }) {
  return (
    <div className="scooter-thumb" aria-hidden={!imageUrl}>
      {imageUrl ? <img src={imageUrl} alt={alt} /> : <ScooterIllustration />}
    </div>
  );
}
