import { ReactNode } from 'react';

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
