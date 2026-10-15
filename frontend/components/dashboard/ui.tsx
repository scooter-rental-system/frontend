import type { ReactNode } from "react";
import { STAGE_LABEL } from "@/lib/bookings";
import type { BookingStage, BookingStatus } from "@/lib/types";

const STAGE_TONE: Record<BookingStage, string> = {
  AWAITING_PAYMENT: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  PAYMENT_FAILED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  UPCOMING: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300",
  IN_PROGRESS: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  BALANCE_DUE: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  COMPLETED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
  CANCELLED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  REFUNDED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
};

/** Shows the server-derived stage, with the SDS status as a tooltip. */
export function StageBadge({ stage, status }: { stage: BookingStage; status: BookingStatus }) {
  return (
    <span
      title={`Booking status: ${status}`}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_TONE[stage]}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.12] dark:bg-zinc-950 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-full border border-red-300 px-4 py-1.5 font-medium hover:bg-red-100 sm:self-auto dark:border-red-500/40 dark:hover:bg-red-500/20"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[.12] p-6 text-center text-sm text-zinc-600 dark:border-white/[.15] dark:text-zinc-400">
      {children}
    </div>
  );
}

/** Placeholder blocks shown while data loads. */
export function Skeleton({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-zinc-500 sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
