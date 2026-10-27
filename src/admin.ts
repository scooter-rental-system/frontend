/**
 * Presentation helpers for the admin area: the grouped navigation (existing routes only), payment and notification
 * labels, and the dashboard's summary figures. They only describe data the backend already returned. Kept free of
 * runtime imports so `npm test` can run them directly.
 */
import type { Dashboard, LivePosition, MaintenanceRecord, NotificationLog, Payment, PaymentStatus, Scooter } from './types';

// ─── Navigation ──────────────────────────────────────────────────────────────

export type AdminIconName =
  | 'dashboard'
  | 'reports'
  | 'bookings'
  | 'scooter'
  | 'gear'
  | 'gps'
  | 'maintenance'
  | 'customers'
  | 'billing'
  | 'notifications'
  | 'plus'
  | 'back'
  | 'profile';

export interface AdminLink {
  to: string;
  label: string;
  icon: AdminIconName;
}

export interface AdminGroup {
  title: string;
  links: AdminLink[];
}

/** Every admin route in App.tsx, grouped. No link points at a page that does not exist. */
export const ADMIN_NAV: AdminGroup[] = [
  {
    title: 'Overview',
    links: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
      { to: '/admin/reports', label: 'Reports', icon: 'reports' },
    ],
  },
  {
    title: 'Rentals',
    links: [
      { to: '/admin/bookings', label: 'Bookings', icon: 'bookings' },
      { to: '/admin/fleet', label: 'Scooters', icon: 'scooter' },
      { to: '/admin/gear', label: 'Camping gear', icon: 'gear' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { to: '/admin/gps', label: 'Live GPS', icon: 'gps' },
      { to: '/admin/maintenance', label: 'Maintenance', icon: 'maintenance' },
    ],
  },
  { title: 'Customers', links: [{ to: '/admin/customers', label: 'Customers', icon: 'customers' }] },
  { title: 'Finance', links: [{ to: '/admin/billing', label: 'Payments & billing', icon: 'billing' }] },
  {
    title: 'Communication',
    links: [{ to: '/admin/notifications', label: 'Notifications', icon: 'notifications' }],
  },
  { title: 'Account', links: [{ to: '/admin/profile', label: 'My profile', icon: 'profile' }] },
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

/** The fleet split by status, as counts and whole-number shares of the fleet (no shares when it is empty). */
export function fleetBreakdown(d: Dashboard): { label: string; count: number; share: number; tone: 'green' | 'blue' | 'amber' }[] {
  const rows = [
    { label: 'Available', count: d.fleetByStatus.AVAILABLE ?? 0, tone: 'green' as const },
    { label: 'Rented', count: d.fleetByStatus.RENTED ?? 0, tone: 'blue' as const },
    { label: 'In workshop', count: d.fleetByStatus.MAINTENANCE ?? 0, tone: 'amber' as const },
  ];
  const total = rows.reduce((n, r) => n + r.count, 0);
  return rows.map((r) => ({ ...r, share: total ? Math.round((r.count / total) * 100) : 0 }));
}

/** Up to two initials for an avatar placeholder (the backend stores no profile photos). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ─── Fleet, maintenance, GPS summaries ───────────────────────────────────────

/** Counts for the fleet summary chips; removed scooters are counted apart from the live statuses. */
export function fleetCounts(scooters: readonly Scooter[]) {
  const live = scooters.filter((s) => !s.deleted);
  return {
    total: live.length,
    available: live.filter((s) => s.status === 'AVAILABLE').length,
    rented: live.filter((s) => s.status === 'RENTED').length,
    maintenance: live.filter((s) => s.status === 'MAINTENANCE').length,
    removed: scooters.length - live.length,
  };
}

/** Open work orders (scheduled or in progress) and the share of them already being worked on. */
export function maintenanceCounts(records: readonly MaintenanceRecord[]) {
  return {
    open: records.filter((m) => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS').length,
    inProgress: records.filter((m) => m.status === 'IN_PROGRESS').length,
    scheduled: records.filter((m) => m.status === 'SCHEDULED').length,
  };
}

/** Live GPS summary: scooters with a position, how many of those are reporting now, and how many are stale. */
export function gpsCounts(positions: readonly LivePosition[]) {
  const located = positions.filter((p) => p.latitude != null && p.longitude != null);
  return {
    located: located.length,
    live: located.filter((p) => !p.stale).length,
    stale: located.filter((p) => p.stale).length,
    onRental: positions.filter((p) => p.activeBookingReference).length,
  };
}
