// Run with `npm test` (Node's built-in test runner; type stripping loads checkout.ts).
// Regression tests for the booking and checkout experience (UI Phase 3, issue #26). The quote below is a TEST-ONLY
// fixture shaped like POST /bookings/quote; production code never prices a booking, it shows the backend's quote.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BOOKING_STEPS, checkoutStep, clampQuantity, paymentLabel, quoteLines, stepStates } from './checkout.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
// Line endings are normalised: a Windows checkout (core.autocrlf) has CRLF files.
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('booking stepper', () => {
  it('has the four real stages, with no separate location or gear step', () => {
    assert.deepEqual([...BOOKING_STEPS], ['Details', 'Agreement', 'Payment', 'Confirmed']);
  });

  it('marks earlier steps done, one step current and later steps upcoming', () => {
    assert.deepEqual(stepStates(0).map((s) => s.state), ['current', 'upcoming', 'upcoming', 'upcoming']);
    assert.deepEqual(stepStates(2).map((s) => s.state), ['done', 'done', 'current', 'upcoming']);
    assert.deepEqual(stepStates(3).map((s) => s.state), ['done', 'done', 'done', 'current']);
    for (let i = 0; i < 4; i++) assert.equal(stepStates(i).filter((s) => s.state === 'current').length, 1);
  });

  it('is an ordered list with aria-current="step" and text for finished steps', () => {
    const stepper = read('components', 'BookingStepper.tsx');
    assert.match(stepper, /<ol className="booking-stepper" aria-label="Booking progress">/);
    assert.match(stepper, /aria-current=\{state === 'current' \? 'step' : undefined\}/);
    assert.match(stepper, /<span className="sr-only"> \(completed\)<\/span>/);
  });

  it('wraps to two columns on phones instead of scrolling sideways', () => {
    const css = read('styles.css');
    assert.match(css, /\.booking-stepper \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 599px\) \{\s*\.booking-stepper \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  });

  it('is shown on ScooterBook (Details), Checkout (Agreement or Payment) and after payment (Confirmed)', () => {
    assert.match(read('pages', 'ScooterBook.tsx'), /<BookingStepper current=\{0\} \/>/);
    assert.match(read('pages', 'Checkout.tsx'), /<BookingStepper current=\{checkoutStep\(c\.signed\)\} \/>/);
    assert.match(
      read('pages', 'BookingDetail.tsx'),
      /\{params\.get\('paid'\) && b\.status === 'ACTIVE' && \(\s*<>\s*<BookingStepper current=\{3\} \/>/,
    );
  });
});

describe('agreement → payment progression', () => {
  it('follows the real contract state', () => {
    assert.equal(checkoutStep(false), 1);
    assert.equal(checkoutStep(true), 2);
  });

  const checkout = read('pages', 'Checkout.tsx');

  it('keeps payment locked until the agreement is signed', () => {
    assert.match(checkout, /disabled=\{!c\.signed\}/);
    assert.match(checkout, /c\.signed \? ' is-active' : ' is-locked'/);
    assert.match(checkout, /\{c\.signed \? 'Ready to pay' : 'Locked'\}/);
    assert.match(checkout, /\{!c\.signed && \(\s*<p className="checkout-locked">[\s\S]*?Sign the rental agreement above to unlock payment\./);
  });

  it('shows the signed state from the contract the backend returned', () => {
    assert.match(checkout, /\{c\.signed \? \(\s*<div className="alert success" role="status">\s*Signed by <strong>\{c\.signedName\}<\/strong> on \{date\(c\.signedAt\)\}\./);
  });

  it('signs through the unchanged contract API and payload', () => {
    assert.match(checkout, /api\.post<Contract>\(`\$\{bookingApi\}\/contract\/sign`, \{ signedName, agree \}\)/);
    assert.match(checkout, /if \(res\) contract\.setData\(res\);/);
    assert.match(checkout, /disabled=\{!agree \|\| !signedName \|\| sign\.busy\}/);
  });

  it('uses a real checkbox in an inline label and a labelled, described name field', () => {
    assert.match(checkout, /<label className="inline">\s*<input type="checkbox" checked=\{agree\}/);
    assert.match(checkout, /Type your full name to sign\s*<input[\s\S]*?aria-describedby="sign-name-hint"/);
    assert.match(checkout, /<p id="sign-name-hint" className="muted small">\s*As on your account: \{user\?\.fullName\}/);
  });

  it('presents the agreement in a bounded, keyboard-scrollable region', () => {
    assert.match(checkout, /<div className="contract" tabIndex=\{0\} role="region" aria-label=\{`Rental agreement \$\{c\.contractNumber\}`\}>/);
  });
});

describe('Stripe wrapper', () => {
  const checkout = read('pages', 'Checkout.tsx');
  const stripe = read('components', 'StripePayment.tsx');

  it('passes the same props to the unchanged StripePayment', () => {
    assert.match(checkout, /purpose="initial"/);
    assert.match(checkout, /amount=\{b\.initialCharge\}/);
    assert.match(checkout, /createIntent=\{\(\) => api\.post<PaymentIntent>\(`\/bookings\/\$\{b\.id\}\/payment-intent`\)\}/);
    assert.match(checkout, /reload=\{\(\) => api\.get<Booking>\(`\/bookings\/\$\{b\.id\}`\)\}/);
    assert.match(checkout, /onSettled=\{\(\) => navigate\(`\/bookings\/\$\{b\.id\}\?paid=1`\)\}/);
  });

  it('keeps Stripe internals: Payment Element, return_url, backend confirmation and theme', () => {
    assert.match(stripe, /<PaymentElement/);
    assert.match(stripe, /return_url: returnUrl\(window\.location\.origin, bookingId, purpose\)/);
    assert.match(stripe, /redirect: 'if_required'/);
    assert.match(stripe, /awaitBackendRecord\(reload, purpose\)/);
    assert.match(stripe, /appearance: \{ theme: resolved === 'dark' \? 'night' : 'stripe' \}/);
  });

  it('adds no card fields or payment shortcuts around Stripe', () => {
    for (const source of [checkout, read('pages', 'ScooterBook.tsx'), read('checkout.ts')]) {
      assert.doesNotMatch(source, /cardNumber|CardElement|4242|pm_card|mock|fake|simulat/i);
    }
  });

  it('says the booking is confirmed only when the backend confirms the payment', () => {
    assert.match(checkout, /Your booking is confirmed once Stripe tells us the payment succeeded/);
    // The success message on return is gated on the backend status, not on the URL alone.
    assert.match(read('pages', 'BookingDetail.tsx'), /params\.get\('paid'\) && b\.status === 'ACTIVE'/);
  });
});

describe('payment status labels (PaymentCard)', () => {
  it('says "Charged" only for a successful payment', () => {
    assert.equal(paymentLabel('SUCCESS'), 'Charged');
    assert.equal(paymentLabel('PENDING'), 'Payment pending');
    assert.equal(paymentLabel('FAILED'), 'Payment failed');
    assert.equal(paymentLabel('REFUNDED'), 'Refunded');
  });

  it('is used by the booking page instead of the old two-way label', () => {
    const detail = read('pages', 'BookingDetail.tsx');
    // A cash payment has its own words (BE-044: "Cash received", never "Charged").
    assert.match(detail, /\{p\.method === 'CASH' \? cashPaymentLabel\(p\.status\) : paymentLabel\(p\.status\)\}/);
    assert.doesNotMatch(detail, /'Refunded' : 'Charged'/);
  });
});

describe('gear quantity', () => {
  it('stays within 0 and the stock the backend reported', () => {
    assert.equal(clampQuantity(2, 3), 2);
    assert.equal(clampQuantity(5, 3), 3);
    assert.equal(clampQuantity(-1, 3), 0);
    assert.equal(clampQuantity(1, 0), 0);
  });

  it('treats non-numbers and fractions safely', () => {
    assert.equal(clampQuantity(Number(''), 3), 0);
    assert.equal(clampQuantity(Number('abc'), 3), 0);
    assert.equal(clampQuantity(2.7, 3), 2);
  });

  it('has named − / + buttons that stop at the limits, and a labelled number field', () => {
    const qty = read('components', 'QuantityStepper.tsx');
    assert.match(qty, /aria-label=\{`Remove one \$\{name\}`\} disabled=\{value <= 0\}/);
    assert.match(qty, /aria-label=\{`Add one \$\{name\}`\} disabled=\{value >= max\}/);
    assert.match(qty, /aria-label=\{`Quantity of \$\{name\}`\}/);
    assert.match(qty, /const set = \(next: number\) => onChange\(clampQuantity\(next, max\)\);/);
  });

  it('uses the backend stock as the limit on ScooterBook', () => {
    const book = read('pages', 'ScooterBook.tsx');
    assert.match(book, /const max = g\.available \?\? g\.totalQuantity;/);
    assert.match(book, /<QuantityStepper\s*name=\{g\.name\}\s*value=\{qty\[g\.id\] \?\? 0\}\s*max=\{max\}/);
  });
});

describe('booking summary', () => {
  const quote = {
    scooterId: 'test',
    currency: 'LKR',
    dailyRate: 2500,
    hourlyRate: 250,
    perKmRate: 15,
    gear: [{ gearItemId: 'g1', name: 'Tent', quantity: 2, dailyRate: 500, days: 1, lineTotal: 1000 }],
    gearPerDay: 1000,
    // Deliberately not the sum of the lines: the summary must show the backend's figure, not recompute it.
    initialCharge: 1234,
  };

  it('lists the backend quote values as they are', () => {
    const { lines, payNow } = quoteLines(quote);
    assert.deepEqual(lines, [
      { label: 'Scooter', detail: 'First hour (minimum)', amount: 250 },
      { label: 'Tent × 2', detail: 'First day', amount: 1000 },
    ]);
    assert.equal(payNow, 1234);
  });

  it('shows the quoted number of gear days', () => {
    const { lines } = quoteLines({ ...quote, gear: [{ ...quote.gear[0], days: 3 }] });
    assert.equal(lines[1].detail, '3 days');
  });

  it('handles a quote without gear', () => {
    assert.deepEqual(quoteLines({ ...quote, gear: [] }).lines, [{ label: 'Scooter', detail: 'First hour (minimum)', amount: 250 }]);
  });
});

describe('ScooterBook keeps its booking behaviour', () => {
  const book = read('pages', 'ScooterBook.tsx');

  it('requests the quote exactly as before, cancelling stale responses', () => {
    assert.match(book, /\.post<Quote>\('\/bookings\/quote', \{ scooterId: id, gear: selection \}\)/);
    assert.match(book, /return \(\) => \{\s*cancelled = true;\s*\};\s*\}, \[id, selection\]\);/);
  });

  it('creates the booking with the same payload and continues to checkout', () => {
    assert.match(book, /api\.post<Booking>\('\/bookings', \{\s*scooterId: id,\s*startTime: start,\s*gear: selection,\s*pickupLocation: pickup,\s*notes,\s*\}\)/);
    assert.match(book, /if \(booking\) navigate\(`\/bookings\/\$\{booking\.id\}\/checkout`\);/);
    assert.match(book, /navigate\('\/login', \{ state: \{ from: `\/scooters\/\$\{id\}\?start=\$\{encodeURIComponent\(start\)\}` \} \}\);/);
  });

  it('enables "Reserve & continue" under the same conditions', () => {
    assert.match(book, /const canReserve = !!quote && startValid && s\.available && !create\.busy;/);
    assert.match(book, /const startValid = start >= dateTimeInput\(new Date\(Date\.now\(\) - 60_000\)\);/);
    assert.match(book, /\{user \? \(create\.busy \? 'Reserving…' : 'Reserve & continue'\) : 'Log in to book'\}/);
  });

  it('groups the rental details and gear in fieldsets, and explains an invalid start time', () => {
    assert.match(book, /<fieldset className="card booking-fieldset">\s*<legend>When &amp; where<\/legend>/);
    assert.match(book, /<fieldset className="card booking-fieldset">\s*<legend>Camping &amp; travel gear<\/legend>/);
    assert.match(book, /aria-invalid=\{!startValid\}\s*aria-describedby="start-hint"/);
    assert.match(book, /'Choose a start time from now onwards\.'/);
  });

  it('keeps the Phase 2 way back to the fleet', () => {
    assert.match(book, /<Link to="\/#fleet" className="back-link">/);
  });
});

describe('checkout summary (open-ended rental)', () => {
  const checkout = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'pages', 'Checkout.tsx'), 'utf8')
    .replace(/\r\n/g, '\n');

  it('lists each rate on its own labelled row', () => {
    for (const label of ['Daily rate', 'Extra-hour rate', 'Excess-distance rate', 'Included distance']) {
      assert.match(checkout, new RegExp(`<dt>${label}</dt>`), label);
    }
    assert.match(checkout, /\{INCLUDED_KM_PER_DAY\} km per charged rental day/);
  });

  it('explains pay now and keeps the final total unknown until the rental ends', () => {
    assert.match(checkout, /Pay now covers the one-hour minimum\{b\.gear\.length > 0 && ' and the first day of your camping gear'\}/);
    assert.match(checkout, /final rental charge is calculated when the rental ends using rental time, excess distance and any camping/);
    assert.match(checkout, /<dt>Final total<\/dt>\s*<dd>Not known yet/);
    assert.match(checkout, /<dt>Balance<\/dt>/);
    assert.match(checkout, /<dd className="num">\{money\(b\.initialCharge\)\}<\/dd>/);
  });
});
