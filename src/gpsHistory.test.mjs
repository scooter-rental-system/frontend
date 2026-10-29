// Run with `npm test` (Node's built-in test runner).
// Admin GPS history of one rental: empty, single-point and route states, and a map view that fits the stored points.
// Nothing here adds or simulates GPS points.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bookingsCsvName } from './admin.ts';
import { NO_HISTORY_HELP, NO_HISTORY_TITLE, ONE_POINT_HELP, routeView } from './gpsHistory.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const page = read('pages', 'admin', 'GpsHistory.tsx');

describe('route view', () => {
  it('has nothing to show without points', () => {
    assert.equal(routeView([]), null);
  });

  it('centres a single report at street level', () => {
    assert.deepEqual(routeView([{ latitude: 7.2936, longitude: 80.6413 }]), { center: [7.2936, 80.6413], zoom: 16 });
  });

  it('centres a route on its extent and zooms out as the route grows', () => {
    const town = routeView([
      { latitude: 7.29, longitude: 80.63 },
      { latitude: 7.30, longitude: 80.64 },
    ]);
    const island = routeView([
      { latitude: 6.9, longitude: 79.85 },
      { latitude: 7.29, longitude: 80.63 },
      { latitude: 6.05, longitude: 80.22 },
    ]);
    assert.deepEqual(town.center.map((n) => Number(n.toFixed(3))), [7.295, 80.635]);
    assert.ok(town.zoom > island.zoom, `${town.zoom} > ${island.zoom}`);
    assert.ok(island.zoom >= 3 && town.zoom <= 17);
  });
});

describe('GPS history page states', () => {
  it('says plainly when no history is recorded yet', () => {
    assert.equal(NO_HISTORY_TITLE, 'No GPS history recorded for this rental yet.');
    assert.equal(NO_HISTORY_HELP, 'Location history appears after GPS reporting starts for the active rental.');
    assert.match(page, /\{h\.points\.length === 0 \|\| !view \? \(\s*<div className="empty-state" role="status">/);
  });

  it('shows one report as a marker only, without pretending there is a route', () => {
    assert.match(ONE_POINT_HELP, /no route to draw/);
    assert.match(page, /trail=\{h\.points\.length > 1 \?/);
    assert.match(page, /\{h\.points\.length === 1 \? \(/);
  });

  it('fits the map to the stored points and offers a retry when loading fails', () => {
    assert.match(page, /const view = routeView\(h\.points\);/);
    assert.match(page, /<LoadError error=\{`We couldn't load the GPS history\./);
    assert.doesNotMatch(page, /Math\.random|simulat|fake/i);
  });
});

describe('bookings CSV download name', () => {
  it('matches the backend: one day, or a range', () => {
    assert.equal(bookingsCsvName('2026-10-27', '2026-10-27'), 'bookings-2026-10-27.csv');
    assert.equal(bookingsCsvName('2026-10-01', '2026-10-31'), 'bookings-2026-10-01-to-2026-10-31.csv');
    assert.match(read('pages', 'admin', 'Reports.tsx'), /bookingsCsvName\(from, to\)/);
  });
});
