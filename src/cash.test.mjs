// Run with `npm test` (Node's built-in test runner).
// Cash at the rental counter (backend BE-044): cash is not a checkout option. The customer pays online (Card, QR Pay,
// Bank Transfer) and only an admin confirms cash, for the final balance from the adjusted final total after any
// approved repair reimbursement, with the exact amount on the button. Payment history keeps each method. Source
// checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CASH_END_NOTE, cashAction, cashConfirmPath, cashPaymentLabel, COUNTER_BALANCE_NOTE, invoiceReimbursement,
  isCashBooking, METHOD_LABEL,
} from './cash.ts';
import { matchesMethodFilter, paymentHistory, paymentMethodsLabel } from './transfers.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const checkout = read('pages', 'Checkout.tsx');
const detail = read('pages', 'BookingDetail.tsx');
const panel = read('components', 'TransferPanel.tsx');
const invoice = read('components', 'InvoiceView.tsx');
const billing = read('pages', 'admin', 'Billing.tsx');
const cashSource = read('cash.ts');
const demoTest = read('demo.test.mjs');

const payment = (over = {}) => ({
  status: 'SUCCESS', amount: 250, balanceDue: null, cardLast4: null, failureReason: null, paidAt: '2026-10-28T10:00:00',
  method: 'QR_TRANSFER', refundDue: null, receipts: [], ...over,
});
const booking = (over = {}) => ({
  id: 'b-1', status: 'ACTIVE', stage: 'IN_PROGRESS', contractSigned: true, endedAt: null, pendingTotalCost: null,
  customer: { id: 'c-1', fullName: 'Alex Traveller', email: 'a@example.test', phone: null },
  payment: payment(), ...over,
});
const ended = (over = {}, bookingOver = {}) => booking({ stage: 'BALANCE_DUE', endedAt: '2026-10-29T10:00:00',
  pendingTotalCost: 6500, payment: payment(over), ...bookingOver });
const lkr = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(n);

describe('checkout', () => {
  it('offers Card / Online Payment, QR Pay and Bank Transfer, never Cash', () => {
    assert.deepEqual(Object.keys(METHOD_LABEL), ['CARD', 'QR_TRANSFER', 'BANK_TRANSFER']);
    assert.equal(METHOD_LABEL.CARD, 'Card / Online Payment');
    assert.match(checkout, /\(\['CARD'\] as const\)\.map\(\(m\) =>/);
    assert.match(checkout, /\{transferChoices\.map\(\(m\) => \(/);
    // Only the comment explaining why may mention cash; the page itself offers no cash.
    const code = checkout.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'CASH'|Cash|cash at the counter|Pay cash/);
  });

  it('has no customer action that creates or confirms a cash payment', () => {
    assert.doesNotMatch(cashSource, /chooseCashPath|CASH_CHECKOUT_NOTE|CASH_HOLD_NOTE|CASH_PENDING_NOTE|'initial'/);
    assert.doesNotMatch(checkout, /\/cash`|cash\/initial|chooseCash|cashConfirmPath|payCash/);
    assert.doesNotMatch(detail, /CASH_PENDING_NOTE|cashPending/);
  });

  it('keeps the card checkout as it was', () => {
    assert.match(checkout, /\{method === 'CARD' && \(\s*<>\s*<div className="stripe-container">\s*<StripePayment/);
    assert.match(checkout, /createIntent=\{\(\) => api\.post<PaymentIntent>\(`\/bookings\/\$\{b\.id\}\/payment-intent`\)\}/);
  });
});

describe('admin "Confirm Cash Payment Received"', () => {
  it('is never offered to a customer, or for a card payment', () => {
    const due = ended({ balanceDue: 6250 });
    assert.equal(cashAction(due, false), null);
    assert.equal(cashAction(ended({ method: 'CARD', balanceDue: 6250 }), true), null, 'the card balance stays with the provider');
    assert.equal(cashAction(booking({ payment: null }), true), null);
    assert.match(detail, /admin=\{inAdmin && isAdmin\(user\?\.role\)\}/);
  });

  it('shows the exact server balance on the button', () => {
    const a = cashAction(ended({ balanceDue: 6250 }), true);
    assert.equal(a.step, 'balance');
    assert.equal(a.amount, 6250);
    assert.equal(a.label, `Confirm Cash Payment Received — ${lkr(6250)}`);
    assert.match(a.message, /recorded as a cash payment, the invoice is settled and the booking is completed/);
    assert.equal(cashConfirmPath('b 1', 'balance'), '/admin/bookings/b%201/cash/balance');
    // The amount sent is the one the backend returned; the backend refuses any other.
    assert.match(panel, /api\.post<Booking>\(cashConfirmPath\(b\.id, action\.step\), \{ amount: action\.amount \}\)/);
  });

  it('is not shown before the final bill, while a refund is due, at zero, after completion or cancellation', () => {
    assert.equal(cashAction(booking({ status: 'PENDING', stage: 'AWAITING_PAYMENT', payment: payment({ status: 'PENDING' }) }), true), null, 'pending');
    assert.equal(cashAction(booking(), true), null, 'rental in progress: no final bill');
    assert.equal(cashAction(ended({ refundDue: 100 }), true), null, 'refund due (QR)');
    assert.equal(cashAction(ended({ balanceDue: 0 }), true), null, 'zero balance');
    assert.equal(cashAction(ended({}), true), null, 'nothing due');
    assert.equal(cashAction(ended({ amount: 6500 }, { status: 'COMPLETED', stage: 'COMPLETED', endedAt: null }), true), null, 'completed');
    assert.equal(cashAction(ended({ balanceDue: 6250 }, { status: 'CANCELLED', stage: 'CANCELLED' }), true), null, 'cancelled');
  });

  it('is not shown while a final QR or bank receipt waits for verification', () => {
    const waiting = ended({ balanceDue: 6250, receipts: [{ id: 'r', kind: 'BALANCE', method: 'QR_TRANSFER', amount: 6250, status: 'PENDING_VERIFICATION' }] });
    assert.equal(cashAction(waiting, true), null);
    const rejected = ended({ balanceDue: 6250, receipts: [{ id: 'r', kind: 'BALANCE', method: 'QR_TRANSFER', amount: 6250, status: 'REJECTED' }] });
    assert.equal(cashAction(rejected, true).amount, 6250);
  });

  it('works for a booking first paid by bank transfer too', () => {
    assert.equal(cashAction(ended({ method: 'BANK_TRANSFER', balanceDue: 6250 }), true).amount, 6250);
  });

  it('asks for confirmation and ignores double clicks while recording', () => {
    assert.match(panel, /const ok = await confirm\(\{\s*title: action\.title,\s*message: action\.message,\s*confirmLabel: 'Confirm cash payment received',/);
    assert.match(panel, /<button className="primary" onClick=\{doCash\} disabled=\{record\.busy\}>\s*\{record\.busy \? 'Recording…' : action\.label\}/);
  });

  it('shows the final bill above it: final total, approved reimbursement, already received, balance due', () => {
    assert.match(panel, /<DetailRow label="Adjusted final total">\{money\(b\.pendingTotalCost\)\}<\/DetailRow>/);
    assert.match(panel, /\{reimbursement > 0 && <DetailRow label="Approved repair reimbursement">−\{money\(reimbursement\)\}<\/DetailRow>\}/);
    assert.match(panel, /<DetailRow label="Already received">\{money\(p\.amount\)\}<\/DetailRow>/);
    assert.match(panel, /<DetailRow label="Balance due">\s*<strong>\{money\(p\.balanceDue\)\}<\/strong>/);
    assert.equal(invoiceReimbursement({ subtotal: 8000, total: 6500 }), 1500);
    assert.equal(invoiceReimbursement({ subtotal: 3250, total: 3250 }), 0);
    assert.doesNotMatch(panel, /claimedAmount/);
  });
});

describe('customer', () => {
  it('is told they may pay at the counter, with no button to mark cash paid', () => {
    assert.equal(COUNTER_BALANCE_NOTE,
      'You may also pay the outstanding balance directly at the rental counter. A staff member will confirm the cash payment.');
    assert.match(panel, /<p className="muted small">\{COUNTER_BALANCE_NOTE\}<\/p>/);
    const customerSide = panel.slice(panel.indexOf('function BalanceTransfer'), panel.indexOf('function AdminBalance'));
    assert.doesNotMatch(customerSide, /cashConfirmPath|cashAction/);
  });

  it('sees Completed after the admin confirms, without reloading', () => {
    assert.match(detail, /const settling = booking\.data\?\.stage === 'BALANCE_DUE';/);
    assert.match(detail, /api\.get<Booking>\(bookingApi\)\.then\(setBooking, \(\) => \{\}\);/);
    assert.match(detail, /\}, 15_000\);/);
  });
});

describe('payment history', () => {
  const tx = (over) => ({ id: Math.random().toString(), status: 'SUCCESS', createdAt: '2026-10-29T10:00:00', recordedBy: 'Admin', ...over });

  it('keeps each method: QR Pay 250 approved, Cash 6,250 received, total 6,500', () => {
    const h = paymentHistory([
      tx({ kind: 'INITIAL', method: 'QR_TRANSFER', amount: 250 }),
      tx({ kind: 'BALANCE', method: 'CASH', amount: 6250 }),
    ], 'QR_TRANSFER');
    assert.deepEqual(h.rows.map((r) => [r.method, r.what, r.amount, r.status]), [
      ['QR Pay', 'Initial payment', 250, 'Approved'],
      ['Cash', 'Final balance', 6250, 'Received'],
    ]);
    assert.equal(h.received, 6500);
  });

  it('leaves out failed card attempts and takes refunds off the total', () => {
    const h = paymentHistory([
      tx({ kind: 'INITIAL', method: 'CARD', amount: 250, status: 'FAILED' }),
      tx({ kind: 'INITIAL', method: 'CARD', amount: 250 }),
      tx({ kind: 'REFUND', method: 'CARD', amount: 100 }),
    ], 'CARD');
    assert.deepEqual(h.rows.map((r) => r.status), ['Paid', 'Refunded']);
    assert.equal(h.received, 150);
    assert.equal(paymentHistory([tx({ kind: 'INITIAL', method: null, amount: 250 })], 'BANK_TRANSFER').rows[0].method, 'Bank Transfer');
  });

  it('names every method on the booking, the invoice and the admin payments list', () => {
    assert.equal(paymentMethodsLabel(['QR_TRANSFER', 'CASH']), 'QR Pay + Cash');
    assert.equal(paymentMethodsLabel(['BANK_TRANSFER', 'CASH']), 'Bank Transfer + Cash');
    assert.match(detail, /<h3 className="small">Payment history<\/h3>/);
    assert.match(detail, /<strong>Total received<\/strong>/);
    assert.match(detail, /methods\.length > 1 \? `Methods: \$\{paymentMethodsLabel\(methods\)\}`/);
    assert.match(invoice, /Payment methods: \{paymentMethodsLabel\(methods\)\}, each recorded or verified by an administrator\./);
    assert.match(billing, /\{p\.paymentMethods\.length > 1 \? paymentMethodsLabel\(p\.paymentMethods\) : PAYMENT_METHOD_LABEL\[p\.method\]\}/);
  });

  it('finds a QR booking settled in cash under both filters', () => {
    const mixed = { method: 'QR_TRANSFER', refundDue: null, paymentMethods: ['QR_TRANSFER', 'CASH'] };
    assert.equal(matchesMethodFilter(mixed, 'CASH'), true);
    assert.equal(matchesMethodFilter(mixed, 'QR_TRANSFER'), true);
    assert.equal(matchesMethodFilter(mixed, 'BANK_TRANSFER'), false);
    assert.equal(matchesMethodFilter({ method: 'CARD', refundDue: null, paymentMethods: ['CARD'] }, 'CASH'), false);
  });
});

describe('bookings paid in cash earlier', () => {
  it('still settle the balance and hand back cash at the counter, by an admin only', () => {
    const cash = ended({ method: 'CASH', balanceDue: 7750 });
    assert.equal(isCashBooking(cash), true);
    assert.equal(cashAction(cash, true).step, 'balance');
    const refund = cashAction(ended({ method: 'CASH', refundDue: 500 }), true);
    assert.equal(refund.step, 'refund');
    assert.equal(refund.label, 'Confirm cash refund given');
    assert.equal(cashAction(ended({ method: 'CASH', refundDue: 500 }), false), null);
    assert.equal(cashPaymentLabel('SUCCESS'), 'Cash received');
    assert.equal(cashPaymentLabel('REFUNDED'), 'Cash refunded');
    assert.match(detail, /\{p\.method === 'CASH' \? cashPaymentLabel\(p\.status\) : paymentLabel\(p\.status\)\}/);
    assert.match(detail, /api\.post<Booking>\(cashConfirmPath\(b\.id, action\.step\), \{ amount: action\.amount \}\)/);
  });

  it('say nothing about Stripe or cards', () => {
    for (const text of [CASH_END_NOTE, COUNTER_BALANCE_NOTE]) {
      assert.doesNotMatch(text, /stripe|card|electronic/i, text);
    }
    const cashRows = invoice.slice(invoice.indexOf('{cash && ('));
    assert.doesNotMatch(cashRows.slice(0, cashRows.indexOf('</tbody>')), /stripe|card|electronic/i);
  });
});

describe('unchanged', () => {
  it('keeps the viva demo controls and their tests', () => {
    assert.match(detail, /<DemoControls\s+booking=\{b\}/);
    assert.match(demoTest, /describe\('admin demo controls'/);
    assert.match(detail, /\{b\.stage === 'BALANCE_DUE' && demoRental && \(/);
  });
});
