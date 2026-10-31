// Run with `npm test` (Node's built-in test runner).
// Daily + extra-hour pricing (backend decision E2). The backend charges every amount; pricing.ts mirrors the rule only
// for the running estimate during a rental, so it is checked against the same boundaries as PricingServiceTests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DISTANCE_PRICING_RULE,
  excessKm,
  GEAR_PRICING_RULE,
  gearDays,
  INCLUDED_KM_PER_DAY,
  includedKm,
  SCOOTER_PRICING_RULE,
  scooterTime,
  scooterTimeCost,
} from './pricing.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

const H = 3_600_000;
const S = 1_000;

describe('scooter time: full days at the daily rate, up to 8 extra hours hourly', () => {
  const cases = [
    ['24h', 24 * H, 1, 0, 2500],
    ['25h', 25 * H, 1, 1, 2750],
    ['27h', 27 * H, 1, 3, 3250],
    ['30h', 30 * H, 1, 6, 4000],
    ['32h', 32 * H, 1, 8, 4500],
    ['32h + 1s', 32 * H + S, 2, 0, 5000],
    ['48h', 48 * H, 2, 0, 5000],
    ['51h', 51 * H, 2, 3, 5750],
    ['56h', 56 * H, 2, 8, 7000],
    ['56h + 1s', 56 * H + S, 3, 0, 7500],
    ['8h', 8 * H, 0, 8, 2000],
    ['8h + 1s', 8 * H + S, 1, 0, 2500],
    ['2h + 1s', 2 * H + S, 0, 3, 750],
    ['zero', 0, 0, 1, 250],
  ];
  for (const [name, ms, days, extraHours, cost] of cases) {
    it(`${name}: ${days} day(s) + ${extraHours} extra hour(s) = LKR ${cost}`, () => {
      assert.deepEqual(scooterTime(ms), { days, extraHours });
      assert.equal(scooterTimeCost(ms, 2500, 250), cost);
    });
  }
});

describe('gear: per day, up to 12 extra hours included, minimum one day', () => {
  const cases = [
    ['1h', 1 * H, 1],
    ['24h', 24 * H, 1],
    ['27h', 27 * H, 1],
    ['36h', 36 * H, 1],
    ['36h + 1s', 36 * H + S, 2],
    ['48h', 48 * H, 2],
    ['60h', 60 * H, 2],
    ['60h + 1s', 60 * H + S, 3],
  ];
  for (const [name, ms, days] of cases) {
    it(`${name}: ${days} day(s)`, () => assert.equal(gearDays(ms), days));
  }
});

describe('distance: at least 120 km per rental, 120 km per further charged day', () => {
  // [duration, km, included, excess] — the same cases as the backend PricingServiceTests.
  const cases = [
    ['6h', 6 * H, 100, 120, 0],
    ['6h', 6 * H, 125, 120, 5],
    ['24h', 24 * H, 120, 120, 0],
    ['24h', 24 * H, 120.01, 120, 0.01],
    ['27h', 27 * H, 125, 120, 5],
    ['32h', 32 * H, 125, 120, 5],
    ['32h + 1s', 32 * H + S, 125, 240, 0],
    ['48h', 48 * H, 250, 240, 10],
    ['51h', 51 * H, 250, 240, 10],
    ['56h', 56 * H, 250, 240, 10],
    ['56h + 1s', 56 * H + S, 365, 360, 5],
  ];
  for (const [name, ms, km, included, excess] of cases) {
    it(`${name} with ${km} km: ${included} km included, ${excess} km charged`, () => {
      const days = scooterTime(ms).days;
      assert.equal(includedKm(days), included);
      assert.ok(Math.abs(excessKm(km, days) - excess) < 1e-9);
    });
  }

  it('uses the same allowance as the backend', () => {
    assert.equal(INCLUDED_KM_PER_DAY, 120);
    assert.match(DISTANCE_PRICING_RULE, /Every rental includes 120 km, and each additional charged day adds another 120 km/);
  });
});

describe('pricing shown to customers', () => {
  it('explains both rules in plain words', () => {
    assert.match(SCOOTER_PRICING_RULE, /up to 8 hours is charged hourly; more than 8 extra hours is charged as an additional day/);
    assert.match(GEAR_PRICING_RULE, /Up to 12 extra hours are included; more than 12 extra hours is charged as an additional day/);
  });

  it('shows the API daily and extra-hour rates, never hard-coded amounts', () => {
    for (const file of [['components', 'ScooterCard.tsx'], ['pages', 'ScooterBook.tsx'], ['pages', 'Checkout.tsx']]) {
      const text = read(...file);
      assert.match(text, /money\((s|b\.scooter)\.dailyRate\)/, file.join('/'));
      assert.match(text, /extra[- ]hour/i, file.join('/'));
      assert.doesNotMatch(text, /\b(2,?500|3,?000|3,?200|4,?500)\b/, file.join('/'));
    }
  });

  it('never shows an hourly rate for gear', () => {
    const book = read('pages', 'ScooterBook.tsx');
    assert.match(book, /\{money\(g\.dailyRate\)\} \/ day/);
    assert.doesNotMatch(book, /g\.hourlyRate|gear.*\/ hour/);
  });

  it('estimates a running rental from its actual start with the same time rule as the bill, never from GPS km', () => {
    const detail = read('pages', 'BookingDetail.tsx');
    assert.match(detail, /const elapsedMs = Date\.now\(\) - new Date\(b\.actualStartTime \?\? b\.startTime\)\.getTime\(\);/);
    assert.match(detail, /scooterTimeCost\(elapsedMs, b\.scooter\.dailyRate, b\.scooter\.hourlyRate\)/);
    assert.match(detail, /const gearDays = chargedGearDays\(elapsedMs\);/);
    // The distance is charged from the odometer at return: GPS km are shown, never priced.
    assert.doesNotMatch(detail, /excessKm\(km|km \* b\.scooter\.perKmRate|chargeableKm/);
    assert.match(detail, /<Stat label="Tracked GPS distance" value=\{`\$\{km\.toFixed\(2\)\} km`\} hint="Approximate · not billed" \/>/);
  });

  it('shows how an ended rental was charged, from the backend breakdown', () => {
    const detail = read('pages', 'BookingDetail.tsx');
    assert.match(detail, /b\.breakdown\.chargedDays/);
    assert.match(detail, /\{b\.breakdown\.includedKm\} km included · \{b\.breakdown\.excessKm\} km charged/);
  });

  it('explains scooter, distance and gear pricing on Home (rules) and the scooter page (with its rates)', () => {
    const info = read('components', 'PricingInfo.tsx');
    for (const text of ['The daily rate covers 24 hours', 'Up to 8 extra hours', 'More than 8 extra hours',
      'km is included per charged rental day', 'excess-km rate', 'Gear is charged per day',
      'Up to 12 extra hours are included', 'More than 12 extra hours']) {
      assert.ok(info.includes(text), text);
    }
    assert.doesNotMatch(info, /\b\d{3,}(\.\d+)?\b(?! km)/, 'no hard-coded amounts');
    assert.match(read('pages', 'Home.tsx'), /<PricingInfo \/>/);
    assert.match(read('pages', 'ScooterBook.tsx'), /<PricingInfo rates=\{s\} \/>/);
  });

  it('lets admins set the daily and extra-hour rates', () => {
    const fleet = read('pages', 'admin', 'Fleet.tsx');
    assert.match(fleet, /Daily rate \(LKR\)/);
    assert.match(fleet, /Extra-hour rate \(LKR\)/);
    assert.match(fleet, /dailyRate: Number\(f\.dailyRate\),/);
  });
});
