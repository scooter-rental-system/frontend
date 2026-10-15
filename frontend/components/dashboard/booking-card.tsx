"use client";

import { useId, useState } from "react";
import { needsAction } from "@/lib/bookings";
import { dateTime, humanize, money } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { DetailRow, StageBadge } from "./ui";

/** What the customer has paid or owes, depending on where the booking is. */
function amountLine(b: Booking): string {
  if (b.totalCost != null) return `Total ${money(b.totalCost)}`;
  if (b.stage === "BALANCE_DUE" && b.payment?.balanceDue != null) return `Balance due ${money(b.payment.balanceDue)}`;
  if (b.payment?.status === "SUCCESS") return `Paid ${money(b.payment.amount)}`;
  if (b.payment?.status === "REFUNDED") return `Refunded ${money(b.payment.amount)}`;
  if (b.status === "CANCELLED") return "Not charged";
  return `Initial charge ${money(b.initialCharge)}`;
}

export function BookingCard({ booking: b }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <li className="rounded-xl border border-black/[.08] bg-white dark:border-white/[.12] dark:bg-zinc-950">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{b.scooter.model}</span>
            <StageBadge stage={b.stage} status={b.status} />
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {b.reference} · {b.scooter.plateNumber} · Starts {dateTime(b.startTime)}
          </div>
          {needsAction(b) && (
            <div className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-300">
              {b.stage === "BALANCE_DUE" ? "Please settle the remaining balance." : "Payment needed to confirm this booking."}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="text-sm tabular-nums">{amountLine(b)}</span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
            className="rounded-full border border-black/[.12] px-4 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:border-white/[.15] dark:hover:bg-white/[.06]"
          >
            {open ? "Hide details" : "Details"}
          </button>
        </div>
      </div>

      {open && (
        <dl id={detailsId} className="flex flex-col gap-2 border-t border-black/[.08] p-4 text-sm dark:border-white/[.12]">
          <DetailRow label="Booking status">{humanize(b.status)}</DetailRow>
          <DetailRow label="Scooter">
            {b.scooter.model} ({b.scooter.code}, {b.scooter.plateNumber})
          </DetailRow>
          <DetailRow label="Rates">
            {money(b.scooter.hourlyRate)} / hour · {money(b.scooter.perKmRate)} / km
          </DetailRow>
          <DetailRow label="Pickup">{b.pickupLocation}</DetailRow>
          {b.dropLocation && <DetailRow label="Drop-off">{b.dropLocation}</DetailRow>}
          <DetailRow label="Start">{dateTime(b.startTime)}</DetailRow>
          {(b.endTime ?? b.endedAt) && <DetailRow label="Ended">{dateTime(b.endTime ?? b.endedAt)}</DetailRow>}
          {b.cancelledAt && <DetailRow label="Cancelled">{dateTime(b.cancelledAt)}</DetailRow>}
          {b.billableHours != null && <DetailRow label="Billable hours">{b.billableHours}</DetailRow>}
          {(b.distanceKm ?? b.pendingDistanceKm) != null && (
            <DetailRow label="Distance">{b.distanceKm ?? b.pendingDistanceKm} km</DetailRow>
          )}
          {b.gear.length > 0 && (
            <DetailRow label="Gear">
              {b.gear.map((g) => `${g.quantity} × ${g.name} (${money(g.dailyRate)}/day)`).join(", ")}
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
                {b.payment.cardLast4 && ` · card ending ${b.payment.cardLast4}`}
                {b.payment.balanceDue != null && b.payment.balanceDue > 0 && ` · balance due ${money(b.payment.balanceDue)}`}
                {b.payment.failureReason && <div className="text-red-700 dark:text-red-300">{b.payment.failureReason}</div>}
              </>
            ) : (
              "Not paid yet"
            )}
          </DetailRow>
          <DetailRow label="Contract">{b.contractSigned ? "Signed" : "Not signed"}</DetailRow>
          {b.notes && <DetailRow label="Notes">{b.notes}</DetailRow>}
          <DetailRow label="Booked on">{dateTime(b.createdAt)}</DetailRow>
        </dl>
      )}
    </li>
  );
}

export function BookingList({ bookings }: { bookings: Booking[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} />
      ))}
    </ul>
  );
}
