// Run with `npm test` (Node's built-in test runner; type stripping loads gps.ts).
// The geolocation object, positions and timers below are TEST-ONLY fakes standing in for the browser. Production
// code never generates positions: gps.ts only forwards what navigator.geolocation reports.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GPS_STATUS_TEXT,
  isTrackingOff,
  REPORT_INTERVAL_MS,
  shouldReportLocation,
  startRiderTracking,
  toLocationReport,
} from './gps.ts';

/** TEST-ONLY browser position. */
function position(latitude, longitude, { speed = null, accuracy = 8 } = {}) {
  return { coords: { latitude, longitude, speed, accuracy } };
}

/** TEST-ONLY navigator.geolocation: records the watcher and lets the test deliver positions and errors. */
function fakeGeolocation() {
  const geo = {
    watching: [],
    cleared: [],
    options: null,
    watchPosition(success, error, options) {
      geo.options = options;
      geo.watching.push({ success, error });
      return 42;
    },
    clearWatch(id) {
      geo.cleared.push(id);
    },
    emit(p) {
      geo.watching.at(-1).success(p);
    },
    fail(code) {
      geo.watching.at(-1).error({ code });
    },
  };
  return geo;
}

/** TEST-ONLY manual clock and timers. */
function fakeTimers() {
  let now = 0;
  let pending = [];
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const t = { at: now + ms, fn };
      pending.push(t);
      return t;
    },
    clearTimeout: (t) => {
      pending = pending.filter((p) => p !== t);
    },
    pendingCount: () => pending.length,
    async advance(ms) {
      now += ms;
      const due = pending.filter((p) => p.at <= now).sort((a, b) => a.at - b.at);
      pending = pending.filter((p) => p.at > now);
      for (const t of due) t.fn();
      await settle();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Records reports; can be told to fail the next sends with an HTTP status. */
function fakeBackend() {
  const sent = [];
  const failures = [];
  return {
    sent,
    failNext: (status) => failures.push(status),
    send: async (report) => {
      const status = failures.shift();
      if (status) throw Object.assign(new Error(`HTTP ${status}`), { status });
      sent.push(report);
    },
  };
}

function track(overrides = {}) {
  const geo = fakeGeolocation();
  const timers = fakeTimers();
  const backend = fakeBackend();
  const statuses = [];
  const stop = startRiderTracking({
    geolocation: geo,
    secureContext: true,
    send: backend.send,
    onStatus: (s) => statuses.push(s),
    timers,
    ...overrides,
  });
  return { geo, timers, backend, statuses, stop };
}

describe('toLocationReport', () => {
  it('sends the browser coordinates, speed (km/h) and accuracy, and nothing that identifies the rider', () => {
    const report = toLocationReport(position(7.2906, 80.6337, { speed: 10, accuracy: 12.5 }));
    assert.deepEqual(report, { latitude: 7.2906, longitude: 80.6337, speedKmh: 36, accuracyMeters: 12.5 });
    for (const key of ['userId', 'scooterId', 'bookingId', 'recordedAt', 'timestamp']) {
      assert.equal(key in report, false, key);
    }
  });

  it('leaves out a speed the browser did not measure, for the backend to derive', () => {
    for (const speed of [null, undefined, Number.NaN, -1]) {
      const report = toLocationReport(position(7.29, 80.63, { speed }));
      assert.equal('speedKmh' in report, false, String(speed));
    }
    assert.equal('speedKmh' in toLocationReport(position(7.29, 80.63, { speed: 400 })), false, 'over the 999.99 km/h limit');
    assert.equal(toLocationReport(position(7.29, 80.63, { speed: 0 })).speedKmh, 0);
  });

  it('leaves out a missing accuracy', () => {
    assert.equal('accuracyMeters' in toLocationReport(position(7.29, 80.63, { accuracy: null })), false);
  });

  it('drops positions without usable coordinates instead of inventing one', () => {
    assert.equal(toLocationReport(position(Number.NaN, 80.63)), null);
    assert.equal(toLocationReport(position(91, 80.63)), null);
    assert.equal(toLocationReport(position(7.29, -181)), null);
  });
});

describe('when to report', () => {
  const me = 'u1';
  const booking = (stage, owner = me) => ({ stage, customer: { id: owner } });

  it("only for the signed-in rider's own rental in progress", () => {
    assert.equal(shouldReportLocation(booking('IN_PROGRESS'), me), true);
    for (const stage of ['AWAITING_PAYMENT', 'PAYMENT_FAILED', 'UPCOMING', 'BALANCE_DUE', 'COMPLETED', 'CANCELLED', 'REFUNDED']) {
      assert.equal(shouldReportLocation(booking(stage), me), false, stage);
    }
    assert.equal(shouldReportLocation(booking('IN_PROGRESS', 'someone-else'), me), false);
    assert.equal(shouldReportLocation(booking('IN_PROGRESS'), undefined), false);
  });

  it('never faster than the backend accepts rider reports (5 s)', () => {
    assert.ok(REPORT_INTERVAL_MS >= 5_000);
  });
});

describe('startRiderTracking', () => {
  it('does nothing without a secure connection or browser support', () => {
    const insecure = track({ secureContext: false });
    assert.deepEqual(insecure.statuses, ['insecure']);
    assert.equal(insecure.geo.watching.length, 0);

    const unsupported = track({ geolocation: undefined });
    assert.deepEqual(unsupported.statuses, ['unsupported']);
  });

  it('watches with high accuracy and reports the first real position at once', async () => {
    const t = track();
    assert.deepEqual(t.statuses, ['starting']);
    assert.equal(t.geo.watching.length, 1);
    assert.equal(t.geo.options.enableHighAccuracy, true);

    t.geo.emit(position(7.2906, 80.6337, { speed: 5 }));
    await t.timers.advance(0);

    assert.deepEqual(t.backend.sent, [{ latitude: 7.2906, longitude: 80.6337, speedKmh: 18, accuracyMeters: 8 }]);
    assert.deepEqual(t.statuses, ['starting', 'active']);
  });

  it('throttles to one report per interval and sends the newest position', async () => {
    const t = track();
    t.geo.emit(position(7.2900, 80.6300));
    await t.timers.advance(0);
    t.geo.emit(position(7.2901, 80.6301));
    t.geo.emit(position(7.2902, 80.6302));
    t.geo.emit(position(7.2903, 80.6303));
    await t.timers.advance(REPORT_INTERVAL_MS - 1);
    assert.equal(t.backend.sent.length, 1, 'nothing more before the interval');

    await t.timers.advance(1);
    assert.equal(t.backend.sent.length, 2);
    assert.equal(t.backend.sent[1].latitude, 7.2903, 'the newest position, not the first one waiting');
    assert.equal(t.timers.pendingCount(), 0);
  });

  it('sends nothing until the browser reports a position', async () => {
    const t = track();
    await t.timers.advance(REPORT_INTERVAL_MS * 3);
    assert.deepEqual(t.backend.sent, []);
  });

  it('stops for good when location permission is denied, without asking again', async () => {
    const t = track();
    t.geo.fail(1);
    assert.deepEqual(t.statuses, ['starting', 'denied']);
    assert.deepEqual(t.geo.cleared, [42]);
    t.geo.emit(position(7.29, 80.63));
    await t.timers.advance(REPORT_INTERVAL_MS);
    assert.deepEqual(t.backend.sent, []);
    assert.equal(isTrackingOff('denied'), true);
    assert.match(GPS_STATUS_TEXT.denied, /^Location permission is required for live rental tracking\./);
  });

  it('keeps watching through an unavailable position or a timeout', async () => {
    const t = track();
    t.geo.fail(2);
    t.geo.fail(3);
    assert.deepEqual(t.statuses, ['starting', 'unavailable', 'timeout']);
    assert.deepEqual(t.geo.cleared, []);
    t.geo.emit(position(7.29, 80.63));
    await t.timers.advance(0);
    assert.equal(t.backend.sent.length, 1);
    assert.equal(t.statuses.at(-1), 'active');
  });

  it('a failed report is retried with the next position', async () => {
    const t = track();
    t.backend.failNext(503);
    t.geo.emit(position(7.2900, 80.6300));
    await t.timers.advance(0);
    assert.equal(t.statuses.at(-1), 'report-failed');
    assert.deepEqual(t.geo.cleared, []);

    t.geo.emit(position(7.2905, 80.6305));
    await t.timers.advance(REPORT_INTERVAL_MS);
    assert.equal(t.backend.sent.length, 1);
    assert.equal(t.statuses.at(-1), 'active');
  });

  for (const [status, why] of [
    [409, 'the rental is no longer under way'],
    [401, 'the session ended'],
    [404, 'the booking is not this rider'],
  ]) {
    it(`stops when the backend answers ${status} (${why})`, async () => {
      const t = track();
      t.backend.failNext(status);
      t.geo.emit(position(7.29, 80.63));
      await t.timers.advance(0);
      assert.equal(t.statuses.at(-1), 'stopped');
      assert.deepEqual(t.geo.cleared, [42]);
      t.geo.emit(position(7.30, 80.64));
      await t.timers.advance(REPORT_INTERVAL_MS);
      assert.deepEqual(t.backend.sent, []);
    });
  }

  it('stop() clears the watcher and the waiting report (leaving the page, rental ended, sign-out)', async () => {
    const t = track();
    t.geo.emit(position(7.2900, 80.6300));
    await t.timers.advance(0);
    t.geo.emit(position(7.2901, 80.6301));
    assert.equal(t.timers.pendingCount(), 1);

    t.stop();
    assert.deepEqual(t.geo.cleared, [42]);
    assert.equal(t.timers.pendingCount(), 0);
    t.geo.emit(position(7.2902, 80.6302));
    await t.timers.advance(REPORT_INTERVAL_MS * 2);
    assert.equal(t.backend.sent.length, 1);
    t.stop(); // harmless twice
    assert.deepEqual(t.geo.cleared, [42]);
  });
});

describe('no generated or stored positions in production code', () => {
  const src = fileURLToPath(new URL('.', import.meta.url));
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const production = files(src).filter((f) => /\.(ts|tsx)$/.test(f));
  const read = (name) => readFileSync(join(src, name), 'utf8');

  it('has no simulated, fake or mock GPS wording or code', () => {
    for (const file of production) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /simulat|fake ?gps|mock ?(gps|location)|dummy ?gps/i, file);
    }
  });

  it('reads positions only from navigator.geolocation and never stores or logs them', () => {
    const gps = read('gps.ts');
    const hook = read('useRiderGps.ts');
    assert.match(hook, /navigator\.geolocation/);
    assert.match(hook, /\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/location/);
    for (const text of [gps, hook]) {
      assert.doesNotMatch(text, /Math\.random|localStorage|sessionStorage|console\./);
    }
  });

  it('exposes the stale flag on live positions', () => {
    assert.match(read('types.ts'), /stale: boolean;/);
    assert.match(read(join('pages', 'admin', 'Gps.tsx')), /p\.stale \? 'STALE'/);
  });
});
