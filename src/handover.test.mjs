// Run with `npm test` (Node's built-in test runner; type stripping loads the .ts modules).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canCancelPickup,
  completePath,
  CONFIRM_START_MESSAGE,
  GPS_NOT_BILLED_NOTE,
  handoverPath,
  HANDOVER_WAITING_CUSTOMER,
  MAX_ODOMETER_KM,
  odometerDistance,
  parseEndOdometer,
  parseOdometer,
  pickupStep,
  READY_FOR_PICKUP_NOTE,
  startPath,
} from './handover.ts';
import { shouldReportLocation } from './gps.ts';
import { cardAction, categoryOf, STAGE_HELP, timeline } from './rental.ts';
import { STAGE_LABEL } from './bookings.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

const ready = (over = {}) => ({
  status: 'READY_FOR_PICKUP',
  stage: 'READY_FOR_PICKUP',
  handoverConfirmedAt: null,
  customerStartConfirmedAt: null,
  ...over,
});

describe('odometer readings', () => {
  it('accepts km with at most one decimal place, like the backend', () => {
    assert.deepEqual(parseOdometer('0', 'starting'), { value: 0 });
    assert.deepEqual(parseOdometer(' 12345.6 ', 'starting'), { value: 12345.6 });
    assert.deepEqual(parseOdometer('1000.50', 'starting'), { value: 1000.5 });
    assert.deepEqual(parseOdometer(String(MAX_ODOMETER_KM), 'ending'), { value: 9_999_999.9 });
  });

  it('refuses a missing, negative, over-precise, non-numeric or too large reading', () => {
    assert.equal(parseOdometer('', 'starting').error, 'Enter the starting odometer reading');
    assert.equal(parseOdometer('-1', 'starting').error, 'The starting odometer reading cannot be negative');
    assert.equal(
      parseOdometer('1000.25', 'ending').error,
      'Enter the ending odometer reading in km with at most one decimal place',
    );
    assert.equal(parseOdometer('12km', 'starting').error, 'Enter a number of km');
    assert.equal(parseOdometer('1e5', 'starting').error, 'Enter a number of km');
    assert.equal(parseOdometer('10000000', 'starting').error, 'The starting odometer reading is too large');
  });

  it('never lets the ending reading be lower than the starting one', () => {
    assert.equal(
      parseEndOdometer('999.9', 1000).error,
      'The ending odometer (999.9 km) cannot be lower than the starting odometer (1000 km)',
    );
    assert.deepEqual(parseEndOdometer('1000', 1000), { value: 1000 });
    assert.deepEqual(parseEndOdometer('1250.5', 1000), { value: 1250.5 });
  });

  it('gives the distance travelled as ending minus starting', () => {
    assert.equal(odometerDistance(1000, 1250.5), 250.5);
    assert.equal(odometerDistance(1000.1, 1000.3), 0.2);
    assert.equal(odometerDistance(1000, 1000), 0);
    assert.equal(odometerDistance(null, 1000), null);
    assert.equal(odometerDistance(1000, null), null);
    assert.equal(odometerDistance(1000, 999), null);
  });

  it('uses the backend endpoints', () => {
    assert.equal(handoverPath('a b'), '/admin/bookings/a%20b/handover');
    assert.equal(startPath('id-1'), '/bookings/id-1/start');
    assert.equal(completePath('id-1'), '/bookings/id-1/complete');
  });
});

describe('the pickup step', () => {
  it('asks the admin for the handover first, then waits for the customer', () => {
    assert.equal(pickupStep(ready(), { admin: true, owner: false }), 'handover');
    assert.equal(pickupStep(ready({ handoverConfirmedAt: '2026-10-30T10:00:00' }), { admin: true, owner: false }),
      'waiting-customer');
  });

  it('lets the customer confirm the start only after the handover', () => {
    assert.equal(pickupStep(ready(), { admin: false, owner: true }), 'waiting-handover');
    assert.equal(pickupStep(ready({ handoverConfirmedAt: '2026-10-30T10:00:00' }), { admin: false, owner: true }),
      'confirm-start');
  });

  it('has nothing to do for anyone else, or once the rental has started', () => {
    assert.equal(pickupStep(ready({ handoverConfirmedAt: 'x' }), { admin: false, owner: false }), null);
    assert.equal(pickupStep(ready({ status: 'ACTIVE', customerStartConfirmedAt: 'x', handoverConfirmedAt: 'x' }),
      { admin: true, owner: true }), null);
    assert.equal(pickupStep(ready({ status: 'PENDING' }), { admin: true, owner: true }), null);
  });

  it('is cancelled by the customer only before the handover, by an admin until the start', () => {
    assert.equal(canCancelPickup(ready(), false), true);
    assert.equal(canCancelPickup(ready({ handoverConfirmedAt: 'x' }), false), false);
    assert.equal(canCancelPickup(ready({ handoverConfirmedAt: 'x' }), true), true);
    assert.equal(canCancelPickup(ready({ status: 'ACTIVE' }), true), false);
  });

  it('explains that the rental has not started, and what confirming starts', () => {
    assert.match(READY_FOR_PICKUP_NOTE, /has not started yet/);
    assert.match(CONFIRM_START_MESSAGE, /rental timer/);
    assert.match(CONFIRM_START_MESSAGE, /active/);
    assert.match(CONFIRM_START_MESSAGE, /location monitoring/);
    assert.match(CONFIRM_START_MESSAGE, /if your browser allows it/);
    assert.match(HANDOVER_WAITING_CUSTOMER, /Waiting for the customer to confirm the rental start/);
  });
});

describe('the ready-for-pickup stage', () => {
  it('is labelled, explained and counted as upcoming', () => {
    assert.equal(STAGE_LABEL.READY_FOR_PICKUP, 'Ready for pickup');
    assert.match(STAGE_HELP.READY_FOR_PICKUP, /The rental starts, and is billed from, when our team hands the scooter over/);
    assert.equal(categoryOf({ stage: 'READY_FOR_PICKUP' }), 'upcoming');
    assert.deepEqual(timeline('READY_FOR_PICKUP').map((s) => s.state), ['done', 'done', 'upcoming', 'upcoming']);
  });

  it('points the customer to confirm the start once the scooter is handed over', () => {
    assert.deepEqual(cardAction({ status: 'READY_FOR_PICKUP', stage: 'READY_FOR_PICKUP', handoverConfirmedAt: null }),
      { target: 'booking', label: 'View booking', primary: false });
    assert.deepEqual(cardAction({ status: 'READY_FOR_PICKUP', stage: 'READY_FOR_PICKUP', handoverConfirmedAt: 'x' }),
      { target: 'booking', label: 'Confirm rental start', primary: true });
  });

  it('does not start browser location monitoring before the rental starts', () => {
    const customer = { id: 'u1' };
    assert.equal(shouldReportLocation({ stage: 'READY_FOR_PICKUP', customer }, 'u1'), false);
    assert.equal(shouldReportLocation({ stage: 'IN_PROGRESS', customer }, 'u1'), true);
  });
});

describe('pickup and return panels', () => {
  const pickup = read('components', 'PickupPanel.tsx');
  const ret = read('components', 'ReturnPanel.tsx');
  const detail = read('pages', 'BookingDetail.tsx');

  it('makes the admin enter the starting odometer before confirming the handover', () => {
    assert.match(pickup, /const parsed = parseOdometer\(reading, 'starting'\);/);
    assert.match(pickup, /if \(parsed\.error !== undefined\) return;/);
    assert.match(pickup, /api\.post<Booking>\(handoverPath\(b\.id\), \{ startOdometerKm: parsed\.value \}\)/);
    assert.match(pickup, /Confirm Scooter Handover/);
    for (const label of ['Planned pickup', 'Scooter', 'Customer', 'Payment']) {
      assert.match(pickup, new RegExp(`<DetailRow label="${label}">`), label);
    }
  });

  it('gives only the customer the start button, never the admin', () => {
    assert.match(pickup, /\{step === 'confirm-start' && <ConfirmStart booking=\{b\} onChanged=\{onChanged\} \/>\}/);
    assert.match(pickup, /api\.post<Booking>\(startPath\(b\.id\)\)/);
    assert.match(pickup, /Confirm Rental Start/);
    assert.match(detail, /owner=\{isOwner && !adminView\}/);
  });

  it('makes the admin enter the ending odometer and shows both readings and the distance', () => {
    assert.match(ret, /const parsed = needsReading \? parseEndOdometer\(reading, b\.startOdometerKm\) : null;/);
    assert.match(ret, /api\.put<Booking>\(completePath\(b\.id\), needsReading \? \{ endOdometerKm: parsed\?\.value \} : \{\}\)/);
    for (const label of ['Starting odometer', 'Actual distance travelled']) {
      assert.match(ret, new RegExp(`<DetailRow label="${label}">`), label);
    }
    assert.match(ret, /Ending odometer \(km\)/);
    for (const label of ['Planned pickup', 'Rental started', 'Starting odometer', 'Ending odometer',
      'Actual distance travelled']) {
      assert.match(detail, new RegExp(`<DetailRow label="${label}">`), label);
    }
  });

  it('keeps GPS for monitoring and says it is not billed', () => {
    assert.match(GPS_NOT_BILLED_NOTE, /never used for billing/);
    assert.match(detail, /\{GPS_NOT_BILLED_NOTE\}/);
    assert.match(detail, /<LiveTracking booking=\{b\} reportLocation=\{shouldReportLocation\(b, user\?\.id\)\} \/>/);
  });
});
