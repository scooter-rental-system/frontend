"use client";

import { api } from "@/lib/api";
import { ownBookings } from "@/lib/bookings";
import type { Booking } from "@/lib/types";
import { useLoad } from "@/lib/use-load";
import { useCustomer } from "./customer-gate";

/** The signed-in customer's bookings from GET /api/bookings (scoped to the caller by the backend). */
export function useCustomerBookings() {
  const user = useCustomer();
  return useLoad(user.id, async (signal) => ownBookings(await api.get<Booking[]>("/bookings", signal), user.id));
}
