// Run with `npm test` (Node's built-in test runner; type stripping loads bookings.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterBookings, groupBookings, needsAction, ownBookings, summarize } from './bookings.ts';

const ME = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

let seq = 0;
function booking(overrides = {}) {
  seq++;
  return {
    id: `b${seq}`,
    reference: `SRK-${seq}`,
    status: 'ACTIVE',
    stage: 'UPCOMING',
    customer: { id: ME, fullName: 'Test Customer', email: 'me@example.com', phone: null },
    scooter: { id: 's1', code: 'SRK-01', model: 'Honda Dio', plateNumber: 'CP-1234', imageUrl: null, hourlyRate: 500, perKmRate: 20 },
    startTime: '2026-10-20T09:00:00',
    endTime: null,
    billableHours: null,
    distanceKm: null,
    totalCost: null,
    endedAt: null,
    pendingDistanceKm: null,
    pendingTotalCost: null,
    initialCharge: 500,
    gear: [],
    payment: null,
    pickupLocation: 'Kandy',
    dropLocation: null,
    notes: null,
    contractSigned: true,
    cancelledAt: null,
    createdAt: '2026-10-10T09:00:00',
    ...overrides,
  };
}

describe('ownBookings', () => {
  it('drops bookings that belong to another customer', () => {
    const mine = booking();
    const theirs = booking({ customer: { id: OTHER, fullName: 'Someone Else', email: 'x@example.com', phone: null } });
    assert.deepEqual(ownBookings([mine, theirs], ME), [mine]);
  });

  it('drops bookings without customer information', () => {
    assert.deepEqual(ownBookings([booking({ customer: null })], ME), []);
  });
});

describe('groupBookings', () => {
  it('puts PENDING and ACTIVE bookings in active reservations, soonest first', () => {
    const later = booking({ startTime: '2026-10-25T09:00:00' });
    const sooner = booking({ status: 'PENDING', stage: 'AWAITING_PAYMENT', startTime: '2026-10-18T09:00:00' });
    const done = booking({ status: 'COMPLETED', stage: 'COMPLETED', endTime: '2026-10-01T12:00:00', totalCost: 1500 });
    const { active, history } = groupBookings([later, done, sooner]);
    assert.deepEqual(active, [sooner, later]);
    assert.deepEqual(history, [done]);
  });

  it('orders history by end or cancellation time, most recent first', () => {
    const oldDone = booking({ status: 'COMPLETED', stage: 'COMPLETED', endTime: '2026-09-01T12:00:00' });
    const cancelled = booking({ status: 'CANCELLED', stage: 'CANCELLED', cancelledAt: '2026-10-05T08:00:00' });
    const newDone = booking({ status: 'COMPLETED', stage: 'COMPLETED', endTime: '2026-10-01T12:00:00' });
    assert.deepEqual(groupBookings([oldDone, cancelled, newDone]).history, [cancelled, newDone, oldDone]);
  });

  it('handles no bookings', () => {
    assert.deepEqual(groupBookings([]), { active: [], history: [] });
  });
});

describe('summarize', () => {
  it('counts bookings by status and totals completed spend', () => {
    const summary = summarize([
      booking({ status: 'PENDING', stage: 'AWAITING_PAYMENT' }),
      booking({ stage: 'IN_PROGRESS' }),
      booking({ stage: 'BALANCE_DUE' }),
      booking({ status: 'COMPLETED', stage: 'COMPLETED', totalCost: 1500 }),
      booking({ status: 'COMPLETED', stage: 'COMPLETED', totalCost: 2500.5 }),
      booking({ status: 'CANCELLED', stage: 'REFUNDED' }),
    ]);
    assert.deepEqual(summary, { total: 6, active: 3, completed: 2, cancelled: 1, needsAction: 2, totalSpent: 4000.5 });
  });

  it('returns zeros for no bookings', () => {
    assert.deepEqual(summarize([]), { total: 0, active: 0, completed: 0, cancelled: 0, needsAction: 0, totalSpent: 0 });
  });
});

describe('needsAction', () => {
  it('flags unpaid, failed and balance-due bookings only', () => {
    for (const stage of ['AWAITING_PAYMENT', 'PAYMENT_FAILED', 'BALANCE_DUE']) assert.equal(needsAction(booking({ stage })), true);
    for (const stage of ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
      assert.equal(needsAction(booking({ stage })), false);
  });
});

describe('filterBookings', () => {
  const all = [
    booking({ status: 'PENDING', stage: 'AWAITING_PAYMENT' }),
    booking(),
    booking({ status: 'COMPLETED', stage: 'COMPLETED' }),
    booking({ status: 'CANCELLED', stage: 'CANCELLED' }),
  ];

  it('filters by status group', () => {
    assert.equal(filterBookings(all, 'ALL').length, 4);
    assert.deepEqual(filterBookings(all, 'ACTIVE'), all.slice(0, 2));
    assert.deepEqual(filterBookings(all, 'COMPLETED'), [all[2]]);
    assert.deepEqual(filterBookings(all, 'CANCELLED'), [all[3]]);
  });
});
