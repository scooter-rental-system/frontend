"use client";

import Link from "next/link";
import { BookingList } from "@/components/dashboard/booking-card";
import { useCustomer } from "@/components/dashboard/customer-gate";
import { Card, EmptyState, ErrorState, SectionHeading, Skeleton, StatCard } from "@/components/dashboard/ui";
import { useCustomerBookings } from "@/components/dashboard/use-customer-bookings";
import { groupBookings, summarize } from "@/lib/bookings";
import { money } from "@/lib/format";
import type { Booking } from "@/lib/types";

const RECENT_HISTORY = 3;

export default function DashboardOverview() {
  const user = useCustomer();
  const { state, reload } = useCustomerBookings();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hi, {user.fullName.split(" ")[0]}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">Here&apos;s an overview of your scooter rentals.</p>
      </div>

      {state.status === "loading" && <Skeleton rows={3} label="Loading your bookings" />}

      {state.status === "error" && (
        <ErrorState message={`We couldn't load your bookings. ${state.error.message}`} onRetry={reload} />
      )}

      {state.status === "success" && <Overview bookings={state.data} />}
    </div>
  );
}

function Overview({ bookings }: { bookings: Booking[] }) {
  const summary = summarize(bookings);
  const { active, history } = groupBookings(bookings);

  return (
    <>
      <section aria-label="Rental summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active reservations"
          value={summary.active}
          hint={summary.needsAction ? `${summary.needsAction} need action` : undefined}
        />
        <StatCard label="Completed rentals" value={summary.completed} />
        <StatCard label="Cancelled" value={summary.cancelled} />
        <StatCard label="Spent on rentals" value={money(summary.totalSpent)} hint="Final totals of completed rentals" />
      </section>

      <section>
        <SectionHeading title="Active reservations" />
        {active.length === 0 ? (
          <EmptyState>You have no active or upcoming reservations.</EmptyState>
        ) : (
          <BookingList bookings={active} />
        )}
      </section>

      <section>
        <SectionHeading
          title="Recent history"
          action={
            history.length > 0 && (
              <Link href="/dashboard/bookings" className="text-sm font-medium underline-offset-4 hover:underline">
                View all bookings
              </Link>
            )
          }
        />
        {history.length === 0 ? (
          <EmptyState>Completed and cancelled bookings will appear here.</EmptyState>
        ) : (
          <BookingList bookings={history.slice(0, RECENT_HISTORY)} />
        )}
      </section>

      <ProfileSummary />
    </>
  );
}

function ProfileSummary() {
  const user = useCustomer();
  return (
    <section>
      <SectionHeading
        title="Profile"
        action={
          <Link href="/dashboard/profile" className="text-sm font-medium underline-offset-4 hover:underline">
            View profile
          </Link>
        }
      />
      <Card className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{user.fullName}</span>
        <span className="break-all text-zinc-600 dark:text-zinc-400">{user.email}</span>
        {user.phone && <span className="text-zinc-600 dark:text-zinc-400">{user.phone}</span>}
      </Card>
    </section>
  );
}
