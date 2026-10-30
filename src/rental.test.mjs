// Run with `npm test` (Node's built-in test runner; type stripping loads rental.ts and routes.ts).
// Regression tests for the customer dashboard and rental experience (UI Phase 4, issue #28). The bookings below are
// TEST-ONLY fixtures shaped like GET /bookings; production code never creates bookings, it shows what the API returns.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  byCategory,
  cardAction,
  categoryCounts,
  categoryOf,
  liveState,
  rightNow,
  SPEED_LIMIT_KMH,
  speedState,
  STAGE_HELP,
  timeline,
} from './rental.ts';
import { bookingActionPath, bookingPath, checkoutPath } from './routes.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
// Line endings are normalised: a Windows checkout (core.autocrlf) has CRLF files.
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

const STATUS_OF = {
  AWAITING_PAYMENT: 'PENDING',
  PAYMENT_FAILED: 'PENDING',
  UPCOMING: 'ACTIVE',
  IN_PROGRESS: 'ACTIVE',
  BALANCE_DUE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'CANCELLED',
};
const booking = (id, stage, startTime, extra = {}) => ({
  id,
  reference: 'REF-' + id,
  stage,
  status: STATUS_OF[stage],
  startTime,
  endTime: null,
  endedAt: null,
  cancelledAt: null,
  ...extra,
});
const ids = (list) => list.map((b) => b.id);

const ALL_STAGES = Object.keys(STATUS_OF);

describe('dashboard "Right now"', () => {
  it('puts a rental in progress first', () => {
    const now = rightNow([
      booking('up', 'UPCOMING', '2026-11-02T10:00'),
      booking('pay', 'AWAITING_PAYMENT', '2026-11-01T10:00'),
      booking('ride', 'IN_PROGRESS', '2026-10-30T10:00'),
    ]);
    assert.equal(now.kind, 'riding');
    assert.equal(now.booking.id, 'ride');
  });

  it('then a balance due, then a payment needed, then the soonest upcoming booking', () => {
    assert.equal(rightNow([booking('pay', 'PAYMENT_FAILED', '2026-11-01T10:00'), booking('bal', 'BALANCE_DUE', '2026-10-01T10:00')]).kind, 'balance');
    assert.equal(rightNow([booking('up', 'UPCOMING', '2026-11-01T10:00'), booking('pay', 'AWAITING_PAYMENT', '2026-11-03T10:00')]).kind, 'pay');
    const up = rightNow([booking('later', 'UPCOMING', '2026-11-05T10:00'), booking('soon', 'UPCOMING', '2026-11-02T10:00')]);
    assert.equal(up.kind, 'upcoming');
    assert.equal(up.booking.id, 'soon');
  });

  it('offers "Find a scooter" when nothing is current', () => {
    assert.deepEqual(rightNow([]), { kind: 'none', booking: null });
    assert.deepEqual(rightNow([booking('done', 'COMPLETED', '2026-10-01T10:00'), booking('x', 'CANCELLED', '2026-10-02T10:00')]), {
      kind: 'none',
      booking: null,
    });
    assert.match(read('pages', 'Dashboard.tsx'), /<Link to="\/" className="btn primary">\s*Find a scooter/);
  });

  it('keeps the existing booking helpers and does not repeat the "Right now" booking', () => {
    const dashboard = read('pages', 'Dashboard.tsx');
    assert.match(dashboard, /import \{ groupBookings, needsAction, summarize \} from '\.\.\/bookings';/);
    assert.match(dashboard, /useCustomerBookings\(\)/);
    assert.match(dashboard, /groups\.active\.filter\(\(b\) => needsAction\(b\) && b\.id !== now\?\.booking\?\.id\)/);
  });
});

describe('next action on a booking card', () => {
  it('continues unpaid bookings at checkout, as before', () => {
    assert.deepEqual(cardAction({ status: 'PENDING', stage: 'AWAITING_PAYMENT' }), { target: 'checkout', label: 'Complete payment', primary: true });
    assert.deepEqual(cardAction({ status: 'PENDING', stage: 'PAYMENT_FAILED' }), { target: 'checkout', label: 'Try payment again', primary: true });
  });

  it('opens the booking page for everything else', () => {
    assert.deepEqual(cardAction({ status: 'ACTIVE', stage: 'BALANCE_DUE' }), { target: 'booking', label: 'Settle balance', primary: true });
    assert.deepEqual(cardAction({ status: 'ACTIVE', stage: 'IN_PROGRESS' }), { target: 'booking', label: 'Track your ride', primary: true });
    for (const stage of ['UPCOMING', 'COMPLETED', 'CANCELLED', 'REFUNDED']) {
      assert.deepEqual(cardAction({ status: STATUS_OF[stage], stage }), { target: 'booking', label: 'View booking', primary: false });
    }
  });

  it('builds encoded paths', () => {
    assert.equal(checkoutPath('a/b'), '/bookings/a%2Fb/checkout');
    assert.equal(bookingActionPath('checkout', 'a/b'), checkoutPath('a/b'));
    assert.equal(bookingActionPath('booking', 'a/b'), bookingPath('a/b'));
    assert.match(read('components', 'BookingCard.tsx'), /to=\{bookingActionPath\(action\.target, b\.id\)\}/);
  });
});

describe('My Bookings', () => {
  const list = [
    booking('done-old', 'COMPLETED', '2026-09-01T10:00', { endTime: '2026-09-01T12:00' }),
    booking('ride', 'IN_PROGRESS', '2026-10-30T10:00'),
    booking('up-late', 'UPCOMING', '2026-11-09T10:00'),
    booking('pay', 'AWAITING_PAYMENT', '2026-11-03T10:00'),
    booking('cancel', 'REFUNDED', '2026-10-10T10:00', { cancelledAt: '2026-10-05T09:00' }),
    booking('done-new', 'COMPLETED', '2026-10-20T10:00', { endTime: '2026-10-20T15:00' }),
    booking('bal', 'BALANCE_DUE', '2026-10-28T10:00'),
  ];

  it('derives every category from the server stage', () => {
    const expected = {
      IN_PROGRESS: 'active',
      BALANCE_DUE: 'active',
      AWAITING_PAYMENT: 'upcoming',
      PAYMENT_FAILED: 'upcoming',
      UPCOMING: 'upcoming',
      COMPLETED: 'past',
      CANCELLED: 'cancelled',
      REFUNDED: 'cancelled',
    };
    for (const stage of ALL_STAGES) assert.equal(categoryOf(booking('x', stage, null)), expected[stage], stage);
  });

  it('filters and orders: active and upcoming soonest first, past and cancelled newest first', () => {
    assert.deepEqual(ids(byCategory(list, 'active')), ['bal', 'ride']);
    assert.deepEqual(ids(byCategory(list, 'upcoming')), ['pay', 'up-late']);
    assert.deepEqual(ids(byCategory(list, 'past')), ['done-new', 'done-old']);
    assert.deepEqual(ids(byCategory(list, 'cancelled')), ['cancel']);
    assert.deepEqual(ids(byCategory(list, 'all')), ['bal', 'ride', 'pay', 'up-late', 'done-new', 'done-old', 'cancel']);
  });

  it('counts each filter', () => {
    assert.deepEqual(categoryCounts(list), { all: 7, active: 2, upcoming: 2, past: 2, cancelled: 1 });
  });

  it('uses the same cards and stage labels as the dashboard', () => {
    const mine = read('pages', 'MyBookings.tsx');
    assert.match(mine, /import \{ BookingList, BookingListSkeleton \} from '\.\.\/components\/BookingCard';/);
    assert.match(mine, /<BookingList bookings=\{shown\} \/>/);
    assert.match(mine, /useCustomerBookings\(\)/);
    // The old table printed humanize(b.stage); every booking page now shows StageBadge (STAGE_LABEL).
    assert.doesNotMatch(mine, /humanize\(b\.stage\)|<table/);
    assert.match(read('components', 'BookingCard.tsx'), /<StageBadge stage=\{b\.stage\} status=\{b\.status\} \/>/);
  });

  it('offers the filters as labelled pressed-state buttons kept in the URL', () => {
    const mine = read('pages', 'MyBookings.tsx');
    assert.match(mine, /<div className="filter-tabs" role="group" aria-label="Show bookings">/);
    assert.match(mine, /aria-pressed=\{filter === f\}/);
    assert.match(mine, /setParams\(f === 'all' \? \{\} : \{ show: f \}, \{ replace: true \}\)/);
  });
});

describe('booking timeline', () => {
  const states = (stage) => timeline(stage).map((s) => `${s.label}:${s.state}`);

  it('follows the server stage', () => {
    assert.deepEqual(states('AWAITING_PAYMENT'), ['Reserved:done', 'Paid:current', 'In progress:upcoming', 'Completed:upcoming']);
    assert.deepEqual(states('UPCOMING'), ['Reserved:done', 'Paid:done', 'In progress:upcoming', 'Completed:upcoming']);
    assert.deepEqual(states('IN_PROGRESS'), ['Reserved:done', 'Paid:done', 'In progress:current', 'Completed:upcoming']);
    assert.deepEqual(states('BALANCE_DUE'), ['Reserved:done', 'Paid:done', 'In progress:done', 'Completed:current']);
    assert.deepEqual(states('COMPLETED'), ['Reserved:done', 'Paid:done', 'In progress:done', 'Completed:done']);
  });

  it('ends a cancelled booking at "Cancelled"', () => {
    assert.deepEqual(states('CANCELLED'), ['Reserved:done', 'Cancelled:stopped']);
    assert.deepEqual(states('REFUNDED'), ['Reserved:done', 'Cancelled · refunded:stopped']);
  });

  it('explains every stage in words, and writes each step state out for screen readers', () => {
    for (const stage of ALL_STAGES) assert.ok(STAGE_HELP[stage], stage);
    const view = read('components', 'BookingTimeline.tsx');
    assert.match(view, /<ol className="timeline" aria-label="Booking timeline">/);
    assert.match(view, /aria-current=\{step\.state === 'current' \? 'step' : undefined\}/);
    assert.match(view, /<span className="sr-only"> \(\{SR\[step\.state\]\}\)<\/span>/);
  });
});

describe('booking detail', () => {
  const detail = read('pages', 'BookingDetail.tsx');

  it('keeps the cancel, end-rental and ownership rules', () => {
    assert.match(detail, /const isOwner = user\?\.id === b\.customer\.id;/);
    assert.match(detail, /const canCancel = b\.stage === 'AWAITING_PAYMENT' \|\| b\.stage === 'PAYMENT_FAILED' \|\| b\.stage === 'UPCOMING';/);
    // A viva demo rental (no payment record) is ended only by the admin demo controls.
    assert.match(detail, /const demoRental = isDemoRental\(b\);/);
    assert.match(detail, /const canEnd = b\.stage === 'IN_PROGRESS' && \(isOwner \|\| isAdmin\(user\?\.role\)\) && !demoRental;/);
    // Phase 6: the accessible dialog replaced window.confirm; the cancel message and the "no" path are unchanged.
    assert.match(detail, /const ok = await confirm\(\{\s*title: 'Cancel booking\?',\s*message: msg,/);
    assert.match(detail, /if \(!ok\) return;\s*if \(await cancel\.run\(/);
    assert.match(detail, /await end\.run\(\(\) => api\.put<Booking>\(`\$\{bookingApi\}\/complete`, \{\}\)\);/);
  });

  it('shows the primary action, End rental and Cancel only under those rules', () => {
    assert.match(detail, /\{b\.status === 'PENDING' && isOwner && \(\s*<Link className="btn primary" to=\{checkoutPath\(b\.id\)\}>/);
    assert.match(detail, /\{canEnd && \(\s*<button className="primary booking-header__end" onClick=\{doEnd\}/);
    assert.match(detail, /\{canCancel && \(\s*<button className="danger" onClick=\{doCancel\}/);
    assert.doesNotMatch(detail, /to=\{`\/bookings\/\$\{b\.id\}\/checkout`\}/);
  });

  it('has a header with the reference, the canonical stage badge and a plain explanation', () => {
    assert.match(detail, /<header className="card booking-header">/);
    assert.match(detail, /<h1>\{b\.reference\}<\/h1>/);
    assert.match(detail, /<StageBadge stage=\{b\.stage\} status=\{b\.status\} \/>/);
    assert.match(detail, /\{demoRental \? DEMO_RENTAL_NOTE : STAGE_HELP\[b\.stage\]\}/);
    assert.match(detail, /<BookingTimeline stage=\{b\.stage\} \/>/);
  });

  it('puts a balance due near the top, with the unchanged Stripe balance flow', () => {
    assert.ok(detail.indexOf('<BalanceDue booking={b}') < detail.indexOf('<LiveTracking booking={b}'));
    assert.match(detail, /<section className="card stack action-panel" aria-labelledby="balance-title">/);
    assert.match(detail, /purpose="balance"/);
    assert.match(detail, /createIntent=\{\(\) => api\.post<PaymentIntent>\(`\/bookings\/\$\{encodeURIComponent\(b\.id\)\}\/balance-intent`\)\}/);
    assert.match(detail, /The balance is shown as paid once Stripe confirms the payment to us\./);
  });

  it('shows "Invoice & receipt" only when the backend returned invoices', () => {
    assert.match(detail, /\{invoices\.data && invoices\.data\.length > 0 && \(\s*<section className="stack" aria-labelledby="invoices-title">\s*<h2 id="invoices-title">Invoice &amp; receipt<\/h2>/);
    assert.match(read('components', 'InvoiceView.tsx'), /\{money\(Math\.abs\(invoice\.total\)\)\}/);
  });

  it('keeps the payment-return handling and the confirmed state gated on the backend', () => {
    assert.match(detail, /function usePaymentReturn\(/);
    assert.match(detail, /awaitBackendRecord\(\(\) => api\.get<Booking>\(bookingApi\), purpose\)/);
    assert.match(detail, /\{params\.get\('paid'\) && b\.status === 'ACTIVE' && \(/);
  });
});

describe('live rental', () => {
  const detail = read('pages', 'BookingDetail.tsx');

  it('labels the position live, last known or not yet reported, from the backend flag', () => {
    assert.deepEqual(liveState({ stale: false, lastSeen: '2026-10-25T10:00:00Z' }), { label: 'Live', tone: 'green' });
    assert.deepEqual(liveState({ stale: true, lastSeen: '2026-10-25T10:00:00Z' }), { label: 'Last known position', tone: 'amber' });
    assert.deepEqual(liveState({ stale: true, lastSeen: null }), { label: 'No location yet', tone: '' });
    assert.deepEqual(liveState(undefined), { label: 'No location yet', tone: '' });
  });

  it('warns in words above the backend speed limit (display only)', () => {
    assert.equal(SPEED_LIMIT_KMH, 60);
    assert.deepEqual(speedState(42.4, false), { text: '42 km/h', over: false });
    assert.deepEqual(speedState(60, false), { text: '60 km/h', over: false });
    assert.deepEqual(speedState(72.6, false), { text: '73 km/h', over: true });
    assert.deepEqual(speedState(90, true), { text: '—', over: false });
    assert.deepEqual(speedState(null, false), { text: '—', over: false });
    assert.match(detail, /\{speed\.over && \(\s*<div className="alert warning" role="alert">\s*<strong>Over the speed limit:<\/strong>/);
  });

  it('keeps the real GPS reporting, 10-second tracking poll and map', () => {
    assert.match(detail, /const gps = useRiderGps\(b\.id, reportLocation\);/);
    assert.match(detail, /reportLocation=\{shouldReportLocation\(b, user\?\.id\)\}/);
    assert.match(detail, /const timer = setInterval\(load, 10_000\);/);
    assert.match(detail, /\.get<Tracking>\(`\/bookings\/\$\{encodeURIComponent\(b\.id\)\}\/tracking`\)/);
    assert.match(detail, /<MapView\s*center=\{\[p\.latitude, p\.longitude\]\}/);
    assert.match(detail, /kind: p\.stale \? 'STALE' : 'RENTED'/);
  });

  it('adds no generated positions', () => {
    for (const file of [['rental.ts'], ['pages', 'BookingDetail.tsx'], ['pages', 'Dashboard.tsx']]) {
      assert.doesNotMatch(read(...file), /simulat|fake|mock|Math\.random|latitude:\s*\d/i, file.join('/'));
    }
  });
});

describe('notifications on small screens', () => {
  const bell = read('components', 'NotificationBell.tsx');

  it('marks unread items in text, visibly and for screen readers', () => {
    assert.match(bell, /\{!n\.read && <span className="sr-only">Unread: <\/span>\}/);
    assert.match(bell, /<span className="notif-item__new" aria-hidden>\s*New\s*<\/span>/);
  });

  it('keeps the dialog, mark-read and mark-all behaviour', () => {
    assert.match(bell, /role="dialog" aria-labelledby="notif-title"/);
    assert.match(bell, /if \(!n\.read\) void center\.markRead\(n\.id\);/);
    assert.match(bell, /onClick=\{\(\) => void center\.markAllRead\(\)\}/);
    assert.match(bell, /You have no notifications\./);
  });

  it('opens as a full-width sheet under the header on phones', () => {
    const css = read('styles.css');
    assert.match(css, /\.notif-panel \{\s*top: 100%;\s*left: 0;\s*right: 0;\s*width: auto;\s*max-height: calc\(100dvh - 64px\);/);
  });
});
