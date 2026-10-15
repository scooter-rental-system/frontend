"use client";

import { useState } from "react";
import { BookingList } from "@/components/dashboard/booking-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/ui";
import { useCustomerBookings } from "@/components/dashboard/use-customer-bookings";
import { filterBookings, groupBookings, type HistoryFilter } from "@/lib/bookings";

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const EMPTY_MESSAGE: Record<HistoryFilter, string> = {
  ALL: "You haven't made any bookings yet.",
  ACTIVE: "You have no active or upcoming reservations.",
  COMPLETED: "You have no completed rentals yet.",
  CANCELLED: "You have no cancelled bookings.",
};

export default function BookingHistory() {
  const { state, reload } = useCustomerBookings();
  const [filter, setFilter] = useState<HistoryFilter>("ALL");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Booking history</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">Every booking you&apos;ve made, with its current status.</p>
      </div>

      <div role="group" aria-label="Filter bookings" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
              filter === f.value
                ? "border-foreground bg-foreground text-background"
                : "border-black/[.12] hover:bg-black/[.04] dark:border-white/[.15] dark:hover:bg-white/[.06]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state.status === "loading" && <Skeleton rows={4} label="Loading your bookings" />}

      {state.status === "error" && (
        <ErrorState message={`We couldn't load your bookings. ${state.error.message}`} onRetry={reload} />
      )}

      {state.status === "success" &&
        (() => {
          // Active reservations first (soonest start), then history (most recent first).
          const { active, history } = groupBookings(state.data);
          const shown = filterBookings([...active, ...history], filter);
          return shown.length === 0 ? (
            <EmptyState>{EMPTY_MESSAGE[filter]}</EmptyState>
          ) : (
            <BookingList bookings={shown} />
          );
        })()}
    </div>
  );
}
