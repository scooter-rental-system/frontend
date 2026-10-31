// Run with `npm test` (Node's built-in test runner).
// Regression tests for UI Phase 5, the admin experience (issue #30), aligned with the project Figma admin screens.
// Helpers are tested directly; the shell and pages are checked through their source, like the other suites.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  activeAdminLink,
  ADMIN_NAV,
  dashboardKpis,
  filterPayments,
  fleetBreakdown,
  fleetCounts,
  gpsCounts,
  initials,
  maintenanceCounts,
  PAYMENT_FILTERS,
  paymentCounts,
} from './admin.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
// Line endings are normalised: a Windows checkout (core.autocrlf) has CRLF files.
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const app = read('App.tsx');
const layout = read('components', 'Layout.tsx');
const css = read('styles.css');
const page = (name) => read('pages', 'admin', name);
const ADMIN_PAGES = ['Billing.tsx', 'Bookings.tsx', 'Dashboard.tsx', 'Fleet.tsx', 'Gps.tsx', 'Maintenance.tsx', 'People.tsx', 'Reports.tsx'];

const dashboard = (over = {}) => ({
  fleetByStatus: { AVAILABLE: 6, RENTED: 3, MAINTENANCE: 1 },
  activeRentals: 3,
  upcoming: 2,
  balanceDue: 0,
  pendingPayment: 1,
  openMaintenance: 1,
  customers: 40,
  revenueLast30Days: 125000,
  currency: 'LKR',
  ...over,
});

describe('admin navigation', () => {
  const links = ADMIN_NAV.flatMap((g) => g.links);

  it('links only to admin routes that exist in App.tsx, each with an icon', () => {
    for (const link of links) {
      assert.ok(link.icon, `${link.to} has an icon`);
      if (link.to === '/admin') continue;
      const path = link.to.replace('/admin/', '');
      assert.match(app, new RegExp(`<Route path="${path}" element=`), link.to);
    }
  });

  it('marks the most specific section as current', () => {
    assert.equal(activeAdminLink('/admin').label, 'Dashboard');
    assert.equal(activeAdminLink('/admin/bookings/abc').label, 'Bookings');
    assert.equal(activeAdminLink('/admin/gps').label, 'Live GPS');
  });
});

describe('admin shell (Figma sidebar and top bar)', () => {
  it('is its own route group, outside the public header and footer, and still admin-only', () => {
    const layoutGroup = app.indexOf('<Route element={<Layout />}>');
    const layoutEnd = app.indexOf('\n      </Route>', layoutGroup);
    const admin = app.indexOf('<Route path="admin"');
    assert.ok(admin > layoutEnd, 'the admin routes are not nested in <Layout />');
    assert.match(app, /<Route path="admin" element=\{<RequireAuth admin><AdminLayout \/><\/RequireAuth>\}>/);
  });

  it('has a skip link, a labelled drawer navigation, a top bar and a focusable main', () => {
    const shell = layout.slice(layout.indexOf('export function AdminLayout'));
    assert.match(shell, /<a className="skip-link" href="#main">/);
    assert.match(shell, /aria-controls="admin-nav"/);
    assert.match(shell, /aria-expanded=\{open\}/);
    assert.match(shell, /aria-label="Admin menu"/);
    assert.match(shell, /<header className="admin-topbar">/);
    assert.match(shell, /<main id="main" className="admin-content" tabIndex=\{-1\}>/);
    assert.match(shell, /\{user && <NotificationBell \/>\}/);
    assert.match(shell, /<ThemeToggle \/>/);
  });

  it('closes the drawer on Escape and returns focus to the menu button', () => {
    const shell = layout.slice(layout.indexOf('export function AdminLayout'));
    assert.match(shell, /e\.key === 'Escape'/);
    assert.match(shell, /buttonRef\.current\?\.focus\(\)/);
    assert.match(shell, /useEffect\(\(\) => setOpen\(false\), \[location\.pathname\]\)/);
  });

  it('hides the closed drawer from the tab order on small screens', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 899px) {\n  .admin-app'));
    assert.match(mobile, /\.sidebar \{[^}]*visibility: hidden;/);
    assert.match(mobile, /\.sidebar\.is-open \{ transform: none; visibility: visible; \}/);
  });

  it('opens the real Add scooter form from the sidebar button', () => {
    assert.match(layout, /<Link to="\/admin\/fleet" state=\{\{ addScooter: true \}\}/);
    assert.match(page('Fleet.tsx'), /addScooter\?: boolean/);
  });

  it('keeps sidebar text readable on the charcoal in both themes (uses the ink tokens)', () => {
    const sidebar = css.match(/\n\.sidebar \{([^}]*)\}/)[1];
    assert.match(sidebar, /background: var\(--ink\)/);
    assert.match(css, /\.sidebar a\.active \{[^}]*color: var\(--ink-accent\)/);
  });
});

describe('dashboard figures come only from real data', () => {
  it('shows the server counts as they are', () => {
    const kpis = dashboardKpis(dashboard());
    assert.deepEqual(
      kpis.map((k) => k.value),
      [3, 2, 1, 0, 6, 1],
    );
    assert.equal(kpis.find((k) => k.label === 'Awaiting payment').attention, true);
  });

  it('splits the fleet into whole-number shares, and none for an empty fleet', () => {
    assert.deepEqual(
      fleetBreakdown(dashboard()).map((f) => [f.label, f.count, f.share]),
      [
        ['Available', 6, 60],
        ['Rented', 3, 30],
        ['In workshop', 1, 10],
      ],
    );
    const empty = fleetBreakdown(dashboard({ fleetByStatus: {} }));
    assert.ok(empty.every((f) => f.count === 0 && f.share === 0));
  });

  it('does not invent trends, growth or random figures on any admin page', () => {
    for (const name of ADMIN_PAGES) {
      const text = page(name);
      assert.doesNotMatch(text, /Math\.random|vs yesterday|vs last|growth|\+\d+(\.\d+)?%/i, name);
    }
  });
});

describe('summary helpers', () => {
  it('builds avatar initials from a name', () => {
    assert.equal(initials('Nimal Perera'), 'NP');
    assert.equal(initials('  ayesha  '), 'A');
    assert.equal(initials('Kamal de Silva'), 'KS');
    assert.equal(initials(null), '?');
  });

  it('counts the live fleet apart from removed scooters', () => {
    const s = (status, deleted = false) => ({ status, deleted });
    assert.deepEqual(fleetCounts([s('AVAILABLE'), s('RENTED'), s('MAINTENANCE'), s('AVAILABLE', true)]), {
      total: 3,
      available: 1,
      rented: 1,
      maintenance: 1,
      removed: 1,
    });
  });

  it('counts open maintenance work', () => {
    const m = (status) => ({ status });
    assert.deepEqual(maintenanceCounts([m('SCHEDULED'), m('IN_PROGRESS'), m('DONE'), m('CANCELLED')]), {
      open: 2,
      inProgress: 1,
      scheduled: 1,
    });
  });

  it('counts GPS positions without inventing any', () => {
    const p = (lat, stale, ref = null) => ({ latitude: lat, longitude: lat, stale, activeBookingReference: ref });
    assert.deepEqual(gpsCounts([p(7.29, false, 'BK-1'), p(7.3, true), p(null, true)]), {
      located: 2,
      live: 1,
      stale: 1,
      onRental: 1,
    });
  });

  it('filters payments by the real statuses only', () => {
    assert.deepEqual(
      PAYMENT_FILTERS.map((f) => f.value),
      ['ALL', 'SUCCESS', 'PENDING', 'FAILED', 'REFUNDED'],
    );
    const payments = [{ status: 'SUCCESS' }, { status: 'FAILED' }, { status: 'SUCCESS' }];
    assert.equal(filterPayments(payments, 'SUCCESS').length, 2);
    assert.equal(paymentCounts(payments).FAILED, 1);
  });
});

describe('admin pages keep their behaviour', () => {
  it('keeps the live GPS polling, stale markers and MapView props unchanged', () => {
    const gps = page('Gps.tsx');
    assert.match(gps, /api\s*\.get<LivePosition\[\]>\('\/admin\/gps\/live'\)/);
    assert.match(gps, /setInterval\(load, 10_000\)/);
    assert.match(gps, /kind: p\.stale \? 'STALE' : p\.status/);
    assert.match(gps, /<MapView markers=\{markers\} trail=\{trail\?\.trail\.map\(\(t\) => \[t\.latitude, t\.longitude\] as \[number, number\]\)\} zoom=\{12\} \/>/);
    assert.match(gps, /\/admin\/gps\/scooters\/\$\{selected\}\/trail\?hours=6/);
    assert.doesNotMatch(gps, /Math\.random|simulat/i);
  });

  it('selects a tracked scooter with a pressed toggle button', () => {
    assert.match(page('Gps.tsx'), /aria-pressed=\{selected === p\.scooterId\}/);
  });

  it('keeps the scooter form payload and offers no fake photo upload', () => {
    const fleet = page('Fleet.tsx');
    assert.match(fleet, /api\.put\(`\/admin\/scooters\/\$\{scooter\.id\}`, body\) : api\.post\('\/admin\/scooters', body\)/);
    assert.match(fleet, /imageUrl: f\.imageUrl \|\| null/);
    assert.doesNotMatch(fleet, /type="file"/);
    assert.match(fleet, /photos are not uploaded here/);
  });

  it('keeps the booking actions and the admin booking links', () => {
    const bookings = page('Bookings.tsx');
    // Handover and return need an odometer reading, so the list links to the booking page instead of ending it.
    assert.doesNotMatch(bookings, /\/complete`/);
    assert.match(bookings, /b\.stage === 'READY_FOR_PICKUP' && !b\.handoverConfirmedAt && \(\s*<Link className="btn small primary" to=\{adminBookingPath\(b\.id\)\}>\s*Hand over/);
    assert.match(bookings, /b\.stage === 'IN_PROGRESS' && \(\s*<Link className="btn small primary" to=\{adminBookingPath\(b\.id\)\}>\s*Return & end/);
    assert.match(bookings, /'PENDING', 'READY_FOR_PICKUP', 'ACTIVE', 'COMPLETED', 'CANCELLED'/);
    assert.match(bookings, /api\.post\(`\/bookings\/\$\{encodeURIComponent\(b\.id\)\}\/cancel`\)/);
    assert.match(bookings, /await confirm\(\{/);
    assert.doesNotMatch(bookings, /window\.confirm/);
  });

  it('keeps the maintenance lifecycle endpoints', () => {
    const m = page('Maintenance.tsx');
    assert.match(m, /api\.post\('\/admin\/maintenance', form\)/);
    assert.match(m, /api\.post\(`\/admin\/maintenance\/\$\{m\.id\}\/\$\{verb\}`\)/);
    assert.match(m, /\/admin\/maintenance\/\$\{completing\.id\}\/complete/);
  });

  it('filters payments with pressed buttons and shows no card details beyond the last four digits', () => {
    const billing = page('Billing.tsx');
    assert.match(billing, /PAYMENT_FILTERS\.map/);
    assert.match(billing, /aria-pressed=\{filter === f\.value\}/);
    assert.doesNotMatch(billing, /stripePaymentId|secret/i);
  });

  it('exports reports only as the real CSV (no PDF the backend cannot make)', () => {
    const reports = page('Reports.tsx');
    assert.match(reports, /\/admin\/reports\/bookings\.csv/);
    assert.doesNotMatch(reports, /PDF/);
  });

  it('labels every admin table column, and every cell for the phone card layout', () => {
    for (const name of ['Billing.tsx', 'Bookings.tsx', 'Fleet.tsx', 'Maintenance.tsx', 'People.tsx']) {
      const text = page(name);
      assert.match(text, /className="admin-table"/, name);
      assert.doesNotMatch(text, /<th>/, `${name}: header cells have scope`);
      assert.match(text, /data-label=/, name);
    }
  });
});
