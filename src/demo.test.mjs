// Run with `npm test` (Node's built-in test runner).
// Viva demo mode (backend profile "demo" only): the banner and admin controls appear only when the backend reports
// demo mode, only admins get the controls, the wording never claims a payment, and the normal payment-unavailable
// checkout is unchanged. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { invoiceStatus } from './transfers.ts';
import {
  DEMO_BANNER, DEMO_HELP, DEMO_LABEL, DEMO_RENTAL_NOTE, DEMO_STATUS_PATH, DEMO_UNSIGNED, DEMO_WARNING, demoActions,
  demoBlocker, isDemoRental,
} from './demo.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const hook = read('useDemoMode.ts');
const panel = read('components', 'DemoMode.tsx');
const layout = read('components', 'Layout.tsx');
const detail = read('pages', 'BookingDetail.tsx');
const checkout = read('pages', 'Checkout.tsx');
const invoice = read('components', 'InvoiceView.tsx');
const css = read('styles.css');

const booking = (over = {}) => ({ status: 'PENDING', stage: 'AWAITING_PAYMENT', contractSigned: true, payment: null, ...over });
const paid = { status: 'SUCCEEDED', amount: 1000 };

describe('demo mode detection', () => {
  it('asks the demo-only status endpoint, signed in only, and treats any failure as normal mode', () => {
    assert.equal(DEMO_STATUS_PATH, '/demo/status');
    assert.match(hook, /api\s*\.get<\{ demo\?: boolean \}>\(DEMO_STATUS_PATH\)/);
    assert.match(hook, /\.then\(\(s\) => s\?\.demo === true\)/);
    assert.match(hook, /\.catch\(/);
    assert.match(hook, /if \(!user\) \{\s*setDemo\(false\);/);
    assert.match(hook, /useState\(false\)/);
  });

  it('shows the banner only in demo mode, in the customer and admin shells', () => {
    assert.match(panel, /const demo = useDemoMode\(\);\s*if \(!demo\) return null;/);
    assert.equal((layout.match(/<DemoBanner \/>/g) ?? []).length, 2);
    assert.match(DEMO_BANNER, /VIVA DEMO MODE/);
    assert.match(DEMO_BANNER, /no real payments are processed/);
    assert.match(css, /\.demo-banner \{/);
  });
});

describe('admin demo controls', () => {
  it('are offered only in demo mode and only to admins', () => {
    assert.deepEqual(demoActions(booking(), false, true), [], 'normal mode');
    assert.deepEqual(demoActions(booking(), true, false), [], 'customer');
    assert.deepEqual(demoActions(booking({ status: 'ACTIVE', stage: 'IN_PROGRESS' }), true, false), []);
    assert.deepEqual(demoActions(booking(), true, true), ['activate']);
  });

  it('render only on the admin booking page', () => {
    assert.match(detail, /\{inAdmin && \(\s*<DemoControls\s+booking=\{b\}\s+actions=\{demoActions\(b, demoMode, isAdmin\(user\?\.role\)\)\}/);
    assert.match(panel, /if \(actions\.length === 0 && !blocker\) return null;/);
  });

  it('follow the booking lifecycle', () => {
    assert.deepEqual(demoActions(booking({ contractSigned: false }), true, true), []);
    assert.equal(demoBlocker(booking({ contractSigned: false }), true, true), DEMO_UNSIGNED);
    assert.equal(demoBlocker(booking({ contractSigned: false }), false, true), '');
    assert.deepEqual(demoActions(booking({ payment: { status: 'FAILED' } }), true, true), [], 'has a real payment');
    assert.deepEqual(demoActions(booking({ status: 'ACTIVE', stage: 'IN_PROGRESS' }), true, true), ['end', 'close']);
    assert.deepEqual(demoActions(booking({ status: 'ACTIVE', stage: 'BALANCE_DUE' }), true, true), ['close']);
    assert.deepEqual(demoActions(booking({ status: 'ACTIVE', stage: 'IN_PROGRESS', payment: paid }), true, true), [],
      'a paid rental is never a demo rental');
    for (const status of ['COMPLETED', 'CANCELLED']) {
      assert.deepEqual(demoActions(booking({ status, stage: status }), true, true), [], status);
    }
  });

  it('use the agreed labels and say plainly that no payment is processed', () => {
    assert.equal(DEMO_LABEL.activate, 'Viva Demo — Activate Rental');
    assert.equal(DEMO_WARNING, 'Demo mode only. No real payment will be processed.');
    assert.match(panel, /<div className="alert warning" role="note">\s*\{DEMO_WARNING\}/);
    assert.match(panel, /message: `\$\{DEMO_HELP\[a\]\} \$\{DEMO_WARNING\}`/);
    assert.match(DEMO_HELP.end, /Nothing is charged/);
    assert.match(panel, /\/admin\/demo\/bookings\/\$\{encodeURIComponent\(b\.id\)\}\/\$\{a\}/);
  });

  it('never claim a payment or imitate a card form', () => {
    const texts = [DEMO_BANNER, DEMO_WARNING, DEMO_RENTAL_NOTE, ...Object.values(DEMO_LABEL), ...Object.values(DEMO_HELP)];
    for (const text of texts) {
      assert.doesNotMatch(text, /payment (was )?successful|\bpaid\b|payment received|stripe|card/i, text);
    }
    assert.doesNotMatch(panel, /StripePayment|PaymentElement|card number|cardLast4/i);
  });
});

describe('a demo rental', () => {
  it('is an active booking without a payment record', () => {
    assert.equal(isDemoRental(booking({ status: 'ACTIVE' })), true);
    assert.equal(isDemoRental(booking({ status: 'ACTIVE', payment: paid })), false);
    assert.equal(isDemoRental(booking()), false);
  });

  it('cannot be ended with the normal button, which would try to charge', () => {
    assert.match(detail, /const canEnd = b\.stage === 'IN_PROGRESS' && \(isOwner \|\| isAdmin\(user\?\.role\)\) && !demoRental;/);
  });

  it('shows the calculated bill as not charged instead of the card balance panel', () => {
    assert.match(detail, /\{b\.stage === 'BALANCE_DUE' && demoRental && \(\s*<DemoSettlement booking=\{b\} invoice=\{invoices\.data\?\.find\(\(i\) => i\.kind === 'FINAL'\)\} \/>\s*\)\}/);
    assert.match(detail, /\{b\.stage === 'BALANCE_DUE' && !demoRental && \(\s*<BalanceDue/);
    assert.match(detail, /Calculated final total/);
    assert.match(detail, /calculated but not charged/);
    assert.match(detail, /' \(calculated, not charged\)'/);
    assert.match(detail, /No payment taken \(viva demo rental\)\./);
    assert.match(detail, /demoRental \? DEMO_RENTAL_NOTE : STAGE_HELP\[b\.stage\]/);
    assert.match(DEMO_RENTAL_NOTE, /No payment has been taken/);
  });

  it('shows a voided final invoice as void', () => {
    assert.match(invoice, /const status = invoiceStatus\(invoice\);/);
    const voided = { kind: 'FINAL', status: 'VOID', paymentStatus: 'SUCCESS', balanceDue: null, refundDue: null };
    assert.equal(invoiceStatus(voided), 'VOID');
  });
});

describe('normal application', () => {
  it('keeps the payment-unavailable checkout untouched by demo mode', () => {
    assert.doesNotMatch(checkout, /demo/i);
    assert.match(detail, /' \(balance due\)'/);
    assert.match(detail, /'Charged at booking'/);
    assert.match(detail, /<BalanceDue booking=\{b\}/);
  });
});
