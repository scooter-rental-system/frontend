// Run with `npm test` (Node's built-in test runner; type stripping loads discovery.ts and routes.ts).
// Regression tests for the Home page and scooter discovery (UI Phase 2, issue #24). The scooters below are
// TEST-ONLY fixtures shaped like GET /scooters; production code never creates scooters, it shows what the API returns.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  availabilityOf,
  discover,
  discoveryParams,
  isFiltered,
  matchesQuery,
  NO_FILTERS,
  parseDiscovery,
  resultSummary,
  SORT_OPTIONS,
} from './discovery.ts';
import { scooterPath } from './routes.ts';

const scooter = (over) => ({
  id: 'id-' + over.code,
  plateNumber: 'TEST',
  engineCc: null,
  status: 'AVAILABLE',
  totalMileage: 0,
  latitude: null,
  longitude: null,
  imageUrl: null,
  description: null,
  deleted: false,
  available: true,
  perKmRate: 10,
  ...over,
});

// In the backend's order (by code).
const FLEET = [
  scooter({ code: 'T-01', model: 'Honda Dio', dailyRate: 3000, hourlyRate: 300, engineCc: 110 }),
  scooter({ code: 'T-02', model: 'TVS Ntorq', dailyRate: 4000, hourlyRate: 400, engineCc: 125, available: false, status: 'RENTED' }),
  scooter({ code: 'T-03', model: 'Yamaha Ray ZR', dailyRate: 2500, hourlyRate: 250, engineCc: null }),
  scooter({ code: 'T-04', model: 'Vespa VXL', dailyRate: 4000, hourlyRate: 400, perKmRate: 5, engineCc: 150, available: false, status: 'MAINTENANCE' }),
];
const codes = (list) => list.map((s) => s.code);
const params = (q) => new URLSearchParams(q);

describe('URL state', () => {
  it('keeps the existing ?available=1 meaning', () => {
    assert.deepEqual(parseDiscovery(params('available=1')), { q: '', available: true, sort: 'featured' });
    assert.equal(parseDiscovery(params('available=0')).available, false);
    assert.equal(parseDiscovery(params('')).available, false);
  });

  it('reads search and sort, ignoring unknown sort values', () => {
    assert.deepEqual(parseDiscovery(params('q=dio&sort=price-desc')), { q: 'dio', available: false, sort: 'price-desc' });
    assert.equal(parseDiscovery(params('sort=cheapest-in-town')).sort, 'featured');
  });

  it('writes only non-default values, so a clear state is a clean URL', () => {
    assert.deepEqual(discoveryParams(NO_FILTERS), {});
    assert.deepEqual(discoveryParams({ q: '  ', available: false, sort: 'featured' }), {});
    assert.deepEqual(discoveryParams({ q: 'ray', available: true, sort: 'engine-desc' }), {
      q: 'ray',
      available: '1',
      sort: 'engine-desc',
    });
  });

  it('round-trips through the URL', () => {
    const state = { q: 'vespa', available: true, sort: 'price-asc' };
    assert.deepEqual(parseDiscovery(new URLSearchParams(discoveryParams(state))), state);
  });

  it('treats search or "available now" as filters; sorting alone hides nothing', () => {
    assert.equal(isFiltered(NO_FILTERS), false);
    assert.equal(isFiltered({ ...NO_FILTERS, sort: 'price-asc' }), false);
    assert.equal(isFiltered({ ...NO_FILTERS, q: 'dio' }), true);
    assert.equal(isFiltered({ ...NO_FILTERS, available: true }), true);
  });
});

describe('search', () => {
  it('matches model and code, ignoring case and extra spaces', () => {
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, q: 'dio' })), ['T-01']);
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, q: '  YAMAHA   ray ' })), ['T-03']);
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, q: 't-04' })), ['T-04']);
  });

  it('needs every word to match', () => {
    assert.equal(matchesQuery(FLEET[0], 'honda dio'), true);
    assert.equal(matchesQuery(FLEET[0], 'honda vespa'), false);
  });

  it('returns nothing (not a fallback list) when nothing matches', () => {
    assert.deepEqual(discover(FLEET, { ...NO_FILTERS, q: 'lambretta' }), []);
    assert.deepEqual(discover([], NO_FILTERS), []);
  });
});

describe('available now', () => {
  it('shows only scooters the backend marks bookable', () => {
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, available: true })), ['T-01', 'T-03']);
  });

  it('combines with search', () => {
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, available: true, q: 'vespa' })), []);
  });
});

describe('sort', () => {
  it('keeps the backend order for "featured"', () => {
    assert.deepEqual(codes(discover(FLEET, NO_FILTERS)), ['T-01', 'T-02', 'T-03', 'T-04']);
  });

  it('sorts by daily price, then extra-hour price, then per-km price', () => {
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, sort: 'price-asc' })), ['T-03', 'T-01', 'T-04', 'T-02']);
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, sort: 'price-desc' })), ['T-02', 'T-04', 'T-01', 'T-03']);
  });

  it('sorts by engine size, with unknown sizes last', () => {
    assert.deepEqual(codes(discover(FLEET, { ...NO_FILTERS, sort: 'engine-desc' })), ['T-04', 'T-02', 'T-01', 'T-03']);
  });

  it('does not reorder the caller\'s array', () => {
    const copy = [...FLEET];
    discover(copy, { ...NO_FILTERS, sort: 'price-asc' });
    assert.deepEqual(codes(copy), codes(FLEET));
  });

  it('offers only sorts that the scooter data supports', () => {
    assert.deepEqual(SORT_OPTIONS.map((o) => o.value), ['featured', 'price-asc', 'price-desc', 'engine-desc']);
  });
});

describe('availability', () => {
  it('lets only bookable scooters be booked, with a text label', () => {
    assert.deepEqual(availabilityOf({ available: true, status: 'AVAILABLE' }), { bookable: true, label: 'Available now', tone: 'green' });
    assert.deepEqual(availabilityOf({ available: false, status: 'RENTED' }), { bookable: false, label: 'Currently rented', tone: 'blue' });
    assert.deepEqual(availabilityOf({ available: false, status: 'MAINTENANCE' }), { bookable: false, label: 'In maintenance', tone: 'amber' });
  });

  it('does not guess a reason the backend did not give', () => {
    // AVAILABLE status but not bookable: held by another booking. No reason is invented.
    assert.deepEqual(availabilityOf({ available: false, status: 'AVAILABLE' }), { bookable: false, label: 'Not available now', tone: '' });
  });
});

describe('result count', () => {
  it('reads naturally', () => {
    assert.equal(resultSummary(4, 4), '4 scooters');
    assert.equal(resultSummary(1, 1), '1 scooter');
    assert.equal(resultSummary(2, 4), 'Showing 2 of 4 scooters');
    assert.equal(resultSummary(0, 4), 'Showing 0 of 4 scooters');
  });
});

describe('routes', () => {
  it('encodes the scooter id in the booking link', () => {
    assert.equal(scooterPath('2f1c'), '/scooters/2f1c');
    assert.equal(scooterPath('../admin?x=1'), '/scooters/..%2Fadmin%3Fx%3D1');
  });
});

describe('Home and card source', () => {
  const src = fileURLToPath(new URL('.', import.meta.url));
  const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const home = read('pages', 'Home.tsx');
  const card = read('components', 'ScooterCard.tsx');
  const ui = read('components', 'ui.tsx');

  it('shows only what the API returns: no fallback or sample scooters', () => {
    assert.match(home, /api\.get<Scooter\[\]>\('\/scooters'\)/);
    assert.match(home, /const all = scooters\.data \?\? \[\];/);
    assert.doesNotMatch(home + card, /hourlyRate:\s*\d|model:\s*'|sample|fallback|mock|fake/i);
  });

  it('links only bookable scooters to booking, through the encoded route helper', () => {
    assert.match(card, /\{availability\.bookable \? \(\s*<Link className="btn primary" to=\{scooterPath\(s\.id\)\}>/);
    assert.doesNotMatch(card + home, /to=\{`\/scooters\//);
    assert.match(card, /onShowAvailable && \(\s*<button type="button" className="small" onClick=\{onShowAvailable\}>\s*See available scooters/);
  });

  it('gives each card an accessible name and each Book link the scooter model', () => {
    assert.match(card, /<article className=\{`card scooter-card[^`]*`\} aria-labelledby=\{titleId\}>/);
    assert.match(card, /Book<span className="sr-only"> \{s\.model\}<\/span>/);
  });

  it('shows the backend rates and availability text on every card', () => {
    // Daily rate first; the extra-hour and per-km rates as the secondary line.
    assert.match(card, /<span className="price">\{money\(s\.dailyRate\)\}<\/span>\s*<span className="muted small"> \/ day<\/span>/);
    assert.match(card, /\{money\(s\.hourlyRate\)\} \/ extra hour/);
    assert.match(card, /\{INCLUDED_KM_PER_DAY\} km\/day included, then \{money\(s\.perKmRate\)\} \/ km/);
    assert.match(card, /<span className=\{`badge \$\{availability\.tone\}`\}>\{availability\.label\}<\/span>/);
  });

  it('falls back to the project placeholder when a photo is missing or fails to load', () => {
    assert.match(ui, /onError=\{\(\) => setFailedUrl\(imageUrl\)\}/);
    assert.match(ui, /<ScooterIllustration \/>/);
  });

  it('labels the discovery controls and announces the result count politely', () => {
    assert.match(home, /<form className="discovery" role="search" aria-label="Find a scooter"/);
    assert.match(home, /<label className="discovery__search" htmlFor=\{ids\.search\}>\s*Search/);
    assert.match(home, /<label className="discovery__sort" htmlFor=\{ids\.sort\}>\s*Sort by/);
    assert.match(home, /Available now only/);
    assert.match(home, /role="status" aria-atomic="true">\s*\{resultSummary\(shown\.length, all\.length\)\}/);
  });

  it('distinguishes an empty fleet, an empty filter result and a load error', () => {
    assert.match(home, /No scooters are listed yet/);
    assert.match(home, /No scooters match your filters/);
    assert.match(home, /No scooters are available right now/);
    assert.match(home, /<LoadError error=\{`We couldn't load the scooters\. \$\{scooters\.error\}`\} onRetry=\{scooters\.reload\} \/>/);
    assert.match(home, /Loading scooters…/);
  });

  it('keeps the sort when clearing filters', () => {
    assert.match(home, /const clearFilters = \(\) => setParams\(discoveryParams\(\{ \.\.\.NO_FILTERS, sort: discovery\.sort \}\), \{ replace: true \}\);/);
  });

  it('describes the real booking steps in order', () => {
    const steps = [...home.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(steps, ['Choose & reserve', 'Sign the agreement', 'Pay securely', 'Ride, then end the rental']);
  });

  it('makes no unsupported business claims', () => {
    assert.doesNotMatch(home, /24\/7|cheapest|best price|#1|guarantee|insurance|helmets? included|free cancellation|instant refund/i);
  });
});
