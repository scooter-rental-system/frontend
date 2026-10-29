// Run with `npm test` (Node's built-in test runner).
// Cash at the rental counter (backend BE-044): checkout offers Card / Online Payment and Cash, cash never depends on
// the card provider, only an admin confirms cash (received or handed back), and the final cash balance comes from the
// adjusted final total after any approved repair reimbursement. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CASH_CHECKOUT_NOTE, CASH_END_NOTE, CASH_HOLD_NOTE, CASH_PENDING_NOTE, cashAction, cashConfirmPath, cashPaymentLabel,
  chooseCashPath, invoiceReimbursement, isCashBooking, METHOD_LABEL,
} from './cash.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const checkout = read('pages', 'Checkout.tsx');
const detail = read('pages', 'BookingDetail.tsx');
const invoice = read('components', 'InvoiceView.tsx');
const billing = read('pages', 'admin', 'Billing.tsx');
const cashSource = read('cash.ts');
const demoTest = read('demo.test.mjs');

const payment = (over = {}) => ({
  status: 'PENDING', amount: 250, balanceDue: null, cardLast4: null, failureReason: null, paidAt: null,
  method: 'CASH', refundDue: null, ...over,
});
const booking = (over = {}) => ({
  id: 'b-1', status: 'PENDING', stage: 'AWAITING_PAYMENT', contractSigned: true, endedAt: null,
  customer: { id: 'c-1', fullName: 'Nimal Perera', email: 'n@example.test', phone: null },
  payment: payment(), ...over,
});
const lkr = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(n);

describe('checkout payment method', () => {
  it('offers Card / Online Payment and Cash', () => {
    assert.equal(METHOD_LABEL.CARD, 'Card / Online Payment');
    assert.equal(METHOD_LABEL.CASH, 'Cash');
    assert.match(checkout, /<legend>Payment method<\/legend>/);
    assert.match(checkout, /\(\['CARD', 'CASH'\] as const\)\.map\(\(m\) =>/);
    assert.match(checkout, /type="radio"\s+name="payment-method"/);
  });

  it('keeps cash selectable when card payments are unavailable', () => {
    // Only the unsigned agreement locks the choice; the card provider's availability never does.
    assert.match(checkout, /<fieldset className="payment-methods" disabled=\{!c\.signed\}>/);
    assert.doesNotMatch(checkout, /disabled=\{[^}]*(available|config|setup)/);
    assert.doesNotMatch(cashSource, /loadPaymentConfig|paymentSetup|stripe/i);
  });

  it('explains that an administrator confirms a cash booking, and the 30-minute hold', () => {
    assert.equal(CASH_CHECKOUT_NOTE,
      'Pay in cash at the rental counter. Your booking will be confirmed after an administrator records the payment.');
    assert.match(CASH_HOLD_NOTE, /released 30 minutes after they are made/);
    assert.match(checkout, /\{method === 'CASH' && \(\s*<div className="stack">\s*<div className="alert info" role="note">\s*\{CASH_CHECKOUT_NOTE\}/);
  });

  it('only records the choice: cash is never marked paid by the customer', () => {
    assert.equal(chooseCashPath('b/1'), '/bookings/b%2F1/cash');
    assert.match(checkout, /api\.post<Booking>\(chooseCashPath\(b\.id\)\)/);
    assert.doesNotMatch(checkout, /cash\/initial|cashConfirmPath/);
  });

  it('leaves the card checkout as it was, shown only for Card', () => {
    assert.match(checkout, /\{method === 'CARD' && \(\s*<>\s*<div className="stripe-container">\s*<StripePayment/);
    assert.match(checkout, /createIntent=\{\(\) => api\.post<PaymentIntent>\(`\/bookings\/\$\{b\.id\}\/payment-intent`\)\}/);
    assert.match(checkout, /<li>Processed by Stripe<\/li>/);
  });

  it('says nothing about Stripe or cards for cash', () => {
    for (const text of [CASH_CHECKOUT_NOTE, CASH_HOLD_NOTE, CASH_PENDING_NOTE, CASH_END_NOTE, METHOD_LABEL.CASH]) {
      assert.doesNotMatch(text, /stripe|card|electronic/i, text);
    }
  });
});

describe('admin cash confirmation', () => {
  it('is never offered to a customer, or for a card payment', () => {
    assert.equal(cashAction(booking(), false), null);
    assert.equal(cashAction(booking({ payment: payment({ method: 'CARD' }) }), true), null);
    assert.equal(cashAction(booking({ payment: null }), true), null);
    assert.match(detail, /admin=\{inAdmin && isAdmin\(user\?\.role\)\}/);
  });

  it('shows the initial cash due and confirms it with a dialog', () => {
    const a = cashAction(booking(), true);
    assert.equal(a.step, 'initial');
    assert.equal(a.amount, 250);
    assert.equal(a.dueLabel, 'Cash due now');
    assert.equal(a.label, 'Confirm cash received');
    assert.match(a.message, new RegExp(`Confirm only after you have received ${lkr(250).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} in cash`));
    assert.equal(cashAction(booking({ contractSigned: false }), true), null, 'unsigned agreement');
    assert.equal(cashAction(booking({ payment: payment({ status: 'SUCCESS' }) }), true), null, 'already recorded');
    assert.match(detail, /const ok = await confirm\(\{\s*title: action\.title,\s*message: action\.message,\s*confirmLabel: action\.label,/);
    assert.match(detail, /api\.post<Booking>\(cashConfirmPath\(b\.id, action\.step\), \{ amount: action\.amount \}\)/);
    assert.equal(cashConfirmPath('b 1', 'initial'), '/admin/bookings/b%201/cash/initial');
  });

  it('guards against double clicks while recording', () => {
    assert.match(detail, /<button className="primary" onClick=\{doConfirm\} disabled=\{record\.busy\}>/);
    assert.match(detail, /\{record\.busy \? 'Recording…' : action\.label\}/);
  });

  it('shows the payment as Cash once recorded', () => {
    assert.equal(cashPaymentLabel('SUCCESS'), 'Cash received');
    assert.equal(cashPaymentLabel('PENDING'), 'Cash payment pending');
    assert.equal(cashPaymentLabel('REFUNDED'), 'Cash refunded');
    assert.equal(isCashBooking(booking()), true);
    assert.match(detail, /\{p\.method === 'CASH' && <span className="muted small"> · Cash at the rental counter<\/span>\}/);
    assert.match(billing, /\{p\.method === 'CASH' \? 'Cash' : p\.method\.toLowerCase\(\)\}/);
  });
});

describe('final cash settlement', () => {
  const ended = (over) => booking({ status: 'ACTIVE', stage: 'BALANCE_DUE', endedAt: '2026-10-29T10:00:00',
    pendingTotalCost: 6500, payment: payment({ status: 'SUCCESS', ...over }) });

  it('asks the admin to confirm the final cash balance from the adjusted final total', () => {
    const a = cashAction(ended({ balanceDue: 6250 }), true);
    assert.equal(a.step, 'balance');
    assert.equal(a.amount, 6250);
    assert.equal(a.dueLabel, 'Cash balance due');
    assert.equal(a.label, 'Confirm final cash received');
    assert.match(detail, /<DetailRow label="Final total">\{money\(b\.pendingTotalCost\)\}<\/DetailRow>/);
    assert.match(detail, /<DetailRow label="Cash received">\{money\(p\.amount\)\}<\/DetailRow>/);
    assert.match(detail, /<DetailRow label="Cash balance due">\s*<strong>\{money\(p\.balanceDue\)\}<\/strong>/);
  });

  it('shows the approved repair reimbursement in the cash balance, never the claimed amount', () => {
    assert.equal(invoiceReimbursement({ subtotal: 8000, total: 6500 }), 1500);
    assert.equal(invoiceReimbursement({ subtotal: 1500, total: 0 }), 1500);
    assert.equal(invoiceReimbursement({ subtotal: 3250, total: 3250 }), 0);
    assert.match(detail, /\{reimbursement > 0 && <DetailRow label="Approved repair reimbursement">−\{money\(reimbursement\)\}<\/DetailRow>\}/);
    assert.doesNotMatch(detail.slice(detail.indexOf('function CashPanel')), /claimedAmount/);
  });

  it('shows a cash refund due, which only an admin confirms', () => {
    const a = cashAction(ended({ refundDue: 500 }), true);
    assert.equal(a.step, 'refund');
    assert.equal(a.amount, 500);
    assert.equal(a.label, 'Confirm cash refund given');
    assert.equal(cashAction(ended({ refundDue: 500 }), false), null);
    const cancelled = booking({ status: 'CANCELLED', stage: 'CANCELLED', payment: payment({ status: 'SUCCESS', refundDue: 250 }) });
    assert.equal(cashAction(cancelled, true).step, 'refund');
    assert.match(detail, /<DetailRow label="Cash refund due">\s*<strong>\{money\(p\.refundDue\)\}<\/strong>/);
  });

  it('never shows the card balance panel or an online payment for cash', () => {
    assert.match(detail, /\/\/ A cash balance is paid at the counter, never online: the CashPanel shows it\.\s*if \(isCashBooking\(b\)\) return null;/);
    assert.match(detail, /message: cash \? CASH_END_NOTE : 'The final total is calculated and the balance charged to your card\.'/);
  });
});

describe('invoice', () => {
  it('shows the approved reimbursement, the cash received and the cash balance or refund due', () => {
    assert.match(invoice, /const cash = invoice\.kind === 'FINAL' && invoice\.paymentMethod === 'CASH';/);
    assert.match(invoice, /<td colSpan=\{3\}>Cash already received<\/td>\s*<td className="num">\{money\(invoice\.cashReceived\)\}<\/td>/);
    assert.match(invoice, /<strong>Cash balance due<\/strong>[\s\S]*?\{money\(invoice\.balanceDue\)\}/);
    assert.match(invoice, /<strong>Cash refund due<\/strong>[\s\S]*?\{money\(invoice\.refundDue\)\}/);
    assert.match(invoice, /Payment method: Cash at the rental counter\./);
    assert.match(invoice, /credits\.length > 0 \? 'Adjusted final total' : 'Total'/);
  });

  it('keeps the card balance row for card invoices only, with no Stripe or electronic refund wording for cash', () => {
    assert.match(invoice, /\{!cash && invoice\.balanceDue != null && \(/);
    const cashRows = invoice.slice(invoice.indexOf('{cash && ('));
    assert.doesNotMatch(cashRows, /stripe|card|electronic/i);
  });
});

describe('unchanged', () => {
  it('keeps the viva demo controls and their tests', () => {
    assert.match(detail, /<DemoControls\s+booking=\{b\}/);
    assert.match(demoTest, /describe\('admin demo controls'/);
    assert.match(detail, /\{b\.stage === 'BALANCE_DUE' && demoRental && \(/);
  });
});
