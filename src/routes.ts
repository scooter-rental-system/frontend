/**
 * App paths built from backend ids. Ids are encoded, so a value can never change which route is opened.
 *
 * A booking has two views: the customer's own (`/bookings/:id`, customers only) and the admin view
 * (`/admin/bookings/:id`, admins only). The backend authorizes every request either way: a customer only ever
 * gets their own booking, an admin any booking.
 */
export const bookingPath = (id: string) => `/bookings/${encodeURIComponent(id)}`;

export const adminBookingPath = (id: string) => `/admin/bookings/${encodeURIComponent(id)}`;

/** A scooter's booking page (public). */
export const scooterPath = (id: string) => `/scooters/${encodeURIComponent(id)}`;

/** The checkout (agreement and payment) of an unpaid booking. */
export const checkoutPath = (id: string) => `/bookings/${encodeURIComponent(id)}/checkout`;

/** The page a booking card's action opens (see rental.ts cardAction). */
export const bookingActionPath = (target: 'checkout' | 'booking', id: string) =>
  target === 'checkout' ? checkoutPath(id) : bookingPath(id);
