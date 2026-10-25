/**
 * Presentation helpers for the admin area: the grouped navigation (existing routes only), payment and notification
 * labels, and the dashboard's summary figures. They only describe data the backend already returned. Kept free of
 * runtime imports so `npm test` can run them directly.
 */
import type { Dashboard, NotificationLog, Payment, PaymentStatus } from './types';

// ─── Navigation ──────────────────────────────────────────────────────────────

export interface AdminLink {
  to: string;
  label: string;
}

export interface AdminGroup {
  title: string;
  links: AdminLink[];
}

/** Every admin route in App.tsx, grouped. No link points at a page that does not exist. */
export const ADMIN_NAV: AdminGroup[] = [
  { title: 'Overview', links: [{ to: '/admin', label: 'Dashboard' }, { to: '/admin/reports', label: 'Reports' }] },
  {
    title: 'Rentals',
    links: [
      { to: '/admin/bookings', label: 'Bookings' },
      { to: '/admin/fleet', label: 'Scooters' },
      { to: '/admin/gear', label: 'Camping gear' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { to: '/admin/gps', label: 'Live GPS' },
      { to: '/admin/maintenance', label: 'Maintenance' },
    ],
  },
  { title: 'Customers', links: [{ to: '/admin/customers', label: 'Customers' }] },
  { title: 'Finance', links: [{ to: '/admin/billing', label: 'Payments & billing' }] },
  { title: 'Communication', links: [{ to: '/admin/notifications', label: 'Notifications' }] },
];

/** The link for the current path: the most specific prefix (so /admin/bookings/123 is "Bookings"). */
export function activeAdminLink(pathname: string): AdminLink | undefined {
  return ADMIN_NAV.flatMap((g) => g.links)
    .filter((l) => pathname === l.to || (l.to !== '/admin' && pathname.startsWith(l.to + '/')))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentFilter = 'ALL' | PaymentStatus;

/** One filter per real payment status (SDS: PENDING, SUCCESS, FAILED, REFUNDED). */
export const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SUCCESS', label: 'Successful' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export const filterPayments = (payments: readonly Payment[], filter: PaymentFilter) =>
  payments.filter((p) => filter === 'ALL' || p.status === filter);

export function paymentCounts(payments: readonly Payment[]): Record<PaymentFilter, number> {
  const counts: Record<PaymentFilter, number> = { ALL: payments.length, SUCCESS: 0, PENDING: 0, FAILED: 0, REFUNDED: 0 };
  for (const p of payments) counts[p.status]++;
  return counts;
}

export const PAYMENT_TONE: Record<PaymentStatus, 'green' | 'amber' | 'red' | ''> = {
  SUCCESS: 'green',
  PENDING: 'amber',
  FAILED: 'red',
  REFUNDED: '',
};

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * The log's channel in words. In-app and email (Amazon SES, when configured) are the channels the backend sends;
 * it has no SMS provider, so an SMS row can only be an earlier record.
 */
export const CHANNEL_LABEL: Record<NotificationLog['channel'], string> = {
  IN_APP: 'In-app',
  EMAIL: 'Email',
  SMS: 'SMS (earlier record)',
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface Kpi {
  label: string;
  value: number;
  hint: string;
  /** Needs an admin's attention when above zero. */
  attention?: boolean;
}

/** The overview figures, straight from GET /admin/dashboard (no derived trends or percentages). */
export function dashboardKpis(d: Dashboard): Kpi[] {
  const fleet = (d.fleetByStatus.AVAILABLE ?? 0) + (d.fleetByStatus.RENTED ?? 0) + (d.fleetByStatus.MAINTENANCE ?? 0);
  return [
    { label: 'Rentals in progress', value: d.activeRentals, hint: 'On the road now' },
    { label: 'Upcoming', value: d.upcoming, hint: 'Paid, not started' },
    { label: 'Awaiting payment', value: d.pendingPayment, hint: 'Booked, not paid', attention: d.pendingPayment > 0 },
    { label: 'Balance due', value: d.balanceDue, hint: 'Ended, charge failed', attention: d.balanceDue > 0 },
    { label: 'Scooters available', value: d.fleetByStatus.AVAILABLE ?? 0, hint: `of ${fleet} in the fleet` },
    { label: 'Open maintenance', value: d.openMaintenance, hint: 'Scheduled or in progress', attention: d.openMaintenance > 0 },
  ];
}
