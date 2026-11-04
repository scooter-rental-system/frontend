import { api } from './api';
import { useAuth } from './auth';
import { ownBookings } from './bookings';
import { useLoad } from './hooks';
import type { Booking } from './types';

/**
 * The signed-in customer's bookings from GET /api/bookings. The backend must
 * scope that endpoint to the caller; `ownBookings` is only a guard on top.
 */
export function useCustomerBookings() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useLoad(
    async () => (userId ? ownBookings(await api.get<Booking[]>('/bookings'), userId) : []),
    [userId],
  );
}
