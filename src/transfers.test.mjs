// Run with `npm test` (Node's built-in test runner).
// QR payments and bank transfers (backend BE-045): an admin configures the receiving details; checkout offers only
// the enabled methods; the customer transfers outside the app and uploads a receipt, which only waits for an admin
// to approve or reject it; the final balance comes from the adjusted final total; refunds are recorded by an admin.
// Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cashAction, METHOD_LABEL } from './cash.ts';
import { ADMIN_NAV } from './admin.ts';
import {
  approveReceiptPath,
  chooseTransferPath,
  filterReceipts,
  isManualMethod,
  manualRefundAction,
  manualRefundPath,
  matchesMethodFilter,
  METHOD_FILTERS,
  offeredTransfers,
  PAYMENT_METHOD_LABEL,
  QR_IMAGE_PATH,
  RECEIPT_FILTERS,
  RECEIPT_STATUS_LABEL,
  RECEIPT_WAITING,
  receiptApproval,
  receiptImagePath,
  receiptProblem,
  receiptsPath,
  referenceProblem,
  rejectReceiptPath,
  REJECTION_REASONS,
  SETTINGS_SAFETY_NOTE,
  settingsProblem,
  TRANSFER_LABEL,
  TRANSFER_REFERENCE_NOTE,
  transferPaymentLabel,
  transferStep,
  verificationHoldNote,
} from './transfers.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const app = read('App.tsx');
const checkout = read('pages', 'Checkout.tsx');
const detail = read('pages', 'BookingDetail.tsx');
const settingsPage = read('pages', 'admin', 'PaymentSettings.tsx');
const billing = read('pages', 'admin', 'Billing.tsx');
const pay = read('components', 'TransferPay.tsx');
const panel = read('components', 'TransferPanel.tsx');
const review = read('components', 'ReceiptReview.tsx');
const invoice = read('components', 'InvoiceView.tsx');
const transfersSource = read('transfers.ts');

const lkr = (n) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(n);
const receipt = (over = {}) => ({
  id: 'r-1', kind: 'INITIAL', method: 'QR_TRANSFER', amount: 250, transferReference: 'TXN-1',
  status: 'PENDING_VERIFICATION', submittedAt: '2026-10-29T10:00:00', reviewedAt: null, rejectionReason: null, ...over,
});
const payment = (over = {}) => ({
  status: 'PENDING', amount: 250, balanceDue: null, cardLast4: null, failureReason: null, paidAt: null,
  method: 'QR_TRANSFER', refundDue: null, receipts: [], ...over,
});
const booking = (over = {}) => ({
  id: 'b-1', reference: 'BK-1001', status: 'PENDING', stage: 'AWAITING_PAYMENT', contractSigned: true, endedAt: null,
  customer: { id: 'c-1', fullName: 'Nimal Perera', email: 'n@example.test', phone: null },
  payment: payment(), ...over,
});
const adminReceipt = (over = {}) => ({
  ...receipt(), bookingId: 'b-1', bookingReference: 'BK-1001', bookingStatus: 'PENDING', customerName: 'Nimal Perera',
  customerEmail: 'n@example.test', amountDue: 250, reviewedBy: null, ...over,
});
const options = { qr: { displayName: 'Scooter Rent Kandy', instructions: null }, bank: null, paymentHoldMinutes: 30,
  verificationHoldMinutes: 120 };
const form = (over = {}) => ({
  qrEnabled: false, qrDisplayName: '', qrInstructions: '', bankEnabled: false, bankName: '', bankAccountHolder: '',
  bankAccountNumber: '', bankBranch: '', bankBranchCode: '', bankInstructions: '', ...over,
});

describe('admin payment settings', () => {
  it('is an admin-only page with a sidebar link', () => {
    const adminBlock = app.slice(app.indexOf('<Route path="admin"'));
    assert.match(adminBlock, /<Route path="payment-settings" element=\{<PaymentSettings \/>\} \/>/);
    assert.match(app, /<Route path="admin" element=\{<RequireAuth admin><AdminLayout \/><\/RequireAuth>\}>/);
    assert.ok(ADMIN_NAV.flatMap((g) => g.links).some((l) => l.to === '/admin/payment-settings'));
    assert.match(settingsPage, /api\.put<Settings>\(PAYMENT_SETTINGS_PATH, form\)/);
    assert.match(transfersSource, /export const PAYMENT_SETTINGS_PATH = '\/admin\/payment-settings';/);
  });

  it('uploads the QR image as one image part and shows it only through the authorised endpoint', () => {
    assert.match(settingsPage, /data\.append\('image', file\);/);
    assert.match(settingsPage, /postForm<Settings>\(`\$\{PAYMENT_SETTINGS_PATH\}\/qr-image`, data\)/);
    assert.match(settingsPage, /<AuthImage path=\{`\$\{ADMIN_QR_IMAGE_PATH\}\?v=\$\{imageVersion\}`\}/);
    assert.match(settingsPage, /accept=\{RECEIPT_ACCEPT\}/);
  });

  it('enables QR only with an image and a display name', () => {
    assert.equal(settingsProblem(form({ qrEnabled: true, qrDisplayName: 'Shop' }), false),
      'Upload the QR image before enabling QR payments.');
    assert.match(settingsProblem(form({ qrEnabled: true }), true), /name shown with the QR code/);
    assert.equal(settingsProblem(form({ qrEnabled: true, qrDisplayName: 'Shop' }), true), null);
  });

  it('enables bank transfer only with the bank, holder, account number and branch', () => {
    const bank = { bankEnabled: true, bankName: 'Bank of Ceylon', bankAccountHolder: 'Scooter Rent Kandy',
      bankAccountNumber: '0001 2345 6789', bankBranch: 'Kandy' };
    assert.equal(settingsProblem(form(bank), false), null);
    assert.match(settingsProblem(form({ ...bank, bankBranch: ' ' }), false), /bank, account holder, account number and branch/);
    assert.match(settingsProblem(form({ ...bank, bankAccountNumber: '12<script>' }), false), /only digits/);
    assert.match(settingsProblem(form({ ...bank, bankBranchCode: '../x' }), false), /branch code/);
    assert.equal(settingsProblem(form({ bankAccountNumber: '' }), false), null, 'disabled with nothing set');
  });

  it('asks only for public receiving details, never credentials', () => {
    for (const label of ['Display name / account name', 'Bank name', 'Account holder name', 'Account number',
      'Branch name', 'Branch code (optional)', 'Payment instruction (optional)', 'QR payment enabled',
      'Bank transfer enabled']) {
      assert.ok(settingsPage.includes(label), label);
    }
    // The rendered form (the page comment explains why such fields do not exist).
    const markup = settingsPage.slice(settingsPage.lastIndexOf('  return ('));
    assert.doesNotMatch(markup, /type="password"|\bpin\b|\botp\b|cvv|card number|login/i);
    assert.match(SETTINGS_SAFETY_NOTE, /Never enter an online banking password, PIN, OTP, card number or banking login/);
  });
});

describe('checkout', () => {
  it('offers QR Pay and Bank Transfer next to Card and Cash, only while enabled', () => {
    assert.equal(METHOD_LABEL.QR_TRANSFER, 'QR Pay');
    assert.equal(METHOD_LABEL.BANK_TRANSFER, 'Bank Transfer');
    assert.match(checkout, /\(\['CARD', 'CASH'\] as const\)\.map\(\(m\) =>/);
    assert.match(checkout, /const transferChoices = offeredTransfers\(options\.data\);/);
    assert.match(checkout, /\{transferChoices\.map\(\(m\) => \(/);
    assert.deepEqual(offeredTransfers(options), ['QR_TRANSFER']);
    assert.deepEqual(offeredTransfers({ ...options, qr: null }), [], 'nothing enabled: no broken options');
    assert.deepEqual(offeredTransfers(null), []);
    assert.deepEqual(offeredTransfers({ ...options, bank: { bankName: 'BOC' } }), ['QR_TRANSFER', 'BANK_TRANSFER']);
  });

  it('shows the QR code, the exact amount and the booking reference', () => {
    assert.match(pay, /<AuthImage path=\{QR_IMAGE_PATH\} alt="QR code to scan"/);
    assert.equal(QR_IMAGE_PATH, '/payments/options/qr-image');
    assert.match(pay, /Pay to <strong>\{qr\.displayName\}<\/strong>/);
    assert.match(pay, /<dt>Amount to transfer<\/dt>/);
    assert.match(pay, /<dt>Reference<\/dt>\s*<dd>\s*<strong>\{reference\}<\/strong>/);
    assert.equal(TRANSFER_REFERENCE_NOTE, 'Use the booking reference when making the transfer.');
    assert.match(checkout, /amount=\{b\.initialCharge\}\s*reference=\{b\.reference\}/);
  });

  it('shows the bank details with copy buttons for the account number and the reference', () => {
    for (const label of ['Bank', 'Account holder', 'Account number', 'Branch']) {
      assert.match(pay, new RegExp(`<dt>${label}</dt>`), label);
    }
    assert.match(pay, /<CopyButton value=\{bank\.accountNumber\} label="account number" \/>/);
    assert.match(pay, /<CopyButton value=\{reference\} label="booking reference" \/>/);
    assert.match(pay, /navigator\.clipboard\.writeText\(value\)/);
  });

  it('never claims to move the money, and explains the verification hold', () => {
    assert.match(transfersSource, /This app does not move the money/);
    assert.equal(verificationHoldNote(options),
      'Upload your receipt within 30 minutes of booking. Once it is submitted, the scooter stays reserved for up to 2 hours while we verify it.');
  });

  it('records the chosen method before the receipt is uploaded', () => {
    assert.match(checkout, /api\.post<Booking>\(chooseTransferPath\(b\.id\), \{ method \}\)/);
    assert.equal(chooseTransferPath('b 1'), '/bookings/b%201/transfer');
    assert.match(checkout, /prepare=\{recordTransfer\}/);
  });
});

describe('receipt upload', () => {
  it('requires a real JPEG, PNG or WebP image of at most 5 MB', () => {
    assert.match(receiptProblem(null), /Attach a photo or screenshot/);
    assert.equal(receiptProblem({ name: 'r.png', type: 'image/png', size: 1000 }), null);
    assert.equal(receiptProblem({ name: 'r.jpeg', type: 'image/jpeg', size: 1000 }), null);
    assert.equal(receiptProblem({ name: 'r.webp', type: 'image/webp', size: 1000 }), null);
    assert.match(receiptProblem({ name: 'r.pdf', type: 'application/pdf', size: 1000 }), /not a JPEG, PNG or WebP/);
    assert.match(receiptProblem({ name: 'r.svg', type: 'image/svg+xml', size: 1000 }), /not a JPEG, PNG or WebP/);
    assert.match(receiptProblem({ name: 'r.html', type: 'image/png', size: 1000 }), /not a JPEG, PNG or WebP/);
    assert.match(receiptProblem({ name: 'r.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /larger than 5 MB/);
    assert.match(receiptProblem({ name: 'r.png', type: 'image/png', size: 0 }), /empty/);
    assert.match(referenceProblem('x'.repeat(101)), /at most 100/);
    assert.equal(referenceProblem('TXN-1'), null);
  });

  it('sends the receipt, the optional reference and, for the balance, the method', () => {
    assert.match(pay, /form\.append\('receipt', file\);/);
    assert.match(pay, /if \(sendMethod\) form\.append\('method', method\);/);
    assert.match(pay, /if \(reference\.trim\(\)\) form\.append\('reference', reference\.trim\(\)\);/);
    assert.match(pay, /postForm<Booking>\(receiptsPath\(b\.id\), form\)/);
    assert.equal(receiptsPath('b/1'), '/bookings/b%2F1/receipts');
    assert.match(pay, /disabled=\{!file \|\| !!problem \|\| submit\.busy\}/);
  });

  it('waits for verification after submission: nothing is paid', () => {
    assert.equal(RECEIPT_WAITING, 'Receipt submitted. Waiting for administrator verification.');
    const waiting = booking({ payment: payment({ receipts: [receipt()] }) });
    assert.deepEqual(transferStep(waiting), { kind: 'waiting', receipt: receipt() });
    assert.equal(transferPaymentLabel(waiting.payment), 'QR Pay receipt waiting for verification');
    assert.match(checkout, /\{waiting \? \(\s*<>\s*<div className="alert info" role="status">\s*\{RECEIPT_WAITING\}/);
    assert.match(panel, /\{RECEIPT_WAITING\}/);
  });

  it('lets the customer replace a rejected receipt, showing the reason', () => {
    const rejected = receipt({ status: 'REJECTED', reviewedAt: '2026-10-29T10:05:00', rejectionReason: 'Unreadable receipt' });
    const step = transferStep(booking({ payment: payment({ receipts: [rejected] }) }));
    assert.equal(step.kind, 'initial');
    assert.equal(step.rejected.rejectionReason, 'Unreadable receipt');
    assert.match(checkout, /Your last receipt was not accepted: \{lastReceipt\.rejectionReason\}/);
    assert.equal(RECEIPT_STATUS_LABEL.REJECTED, 'Rejected');
  });
});

describe('admin verification', () => {
  it('previews the receipt through the authorised endpoint', () => {
    assert.match(review, /<AuthImage path=\{receiptImagePath\(r\.id\)\}/);
    assert.equal(receiptImagePath('r 1'), '/payment-receipts/r%201/image');
    for (const label of ['Customer', 'Method', 'Expected amount', 'Transaction reference', 'Submitted']) {
      assert.match(review, new RegExp(`<DetailRow label="${label}">`), label);
    }
  });

  it('approves with the exact amount after a confirmation, labelled for the step', () => {
    const initial = receiptApproval(adminReceipt());
    assert.equal(initial.label, 'Approve payment');
    assert.match(initial.message, new RegExp(`checked that ${lkr(250).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} by QR payment reached the business account`));
    const final = receiptApproval(adminReceipt({ kind: 'BALANCE', method: 'BANK_TRANSFER', amount: 6250, amountDue: 6250 }));
    assert.equal(final.label, 'Approve final payment');
    assert.equal(receiptApproval(adminReceipt({ status: 'APPROVED' })), null, 'already approved');
    assert.equal(receiptApproval(adminReceipt({ status: 'REJECTED' })), null, 'a rejected receipt is never approved');
    assert.equal(receiptApproval(adminReceipt({ amountDue: 300 })), null, 'the booking expects another amount');
    assert.match(review, /const ok = await confirm\(\{\s*title: approval\.title,\s*message: approval\.message,\s*confirmLabel: approval\.label,/);
    assert.match(review, /api\.post<AdminReceipt>\(approveReceiptPath\(r\.id\), \{ amount: r\.amount \}\)/);
    assert.equal(approveReceiptPath('r1'), '/admin/payment-receipts/r1/approve');
  });

  it('rejects with a reason the customer sees', () => {
    assert.deepEqual([...REJECTION_REASONS],
      ['Incorrect amount', 'Unreadable receipt', 'Transaction not found', 'Wrong account or reference']);
    assert.match(review, /disabled=\{!reason\.trim\(\) \|\| act\.busy\}/);
    assert.match(review, /api\.post<AdminReceipt>\(rejectReceiptPath\(r\.id\), \{ reason: why \}\)/);
    assert.equal(rejectReceiptPath('r1'), '/admin/payment-receipts/r1/reject');
    assert.match(review, /Reject payment/);
  });

  it('lists receipts on the payments page with status filters, and payments by method or refund due', () => {
    assert.match(billing, /<ReceiptReview key=\{r\.id\} receipt=\{r\} onChanged=\{reviewed\} \/>/);
    assert.deepEqual(RECEIPT_FILTERS.map((f) => f.value), ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'ALL']);
    assert.equal(filterReceipts([adminReceipt(), adminReceipt({ status: 'APPROVED' })], 'APPROVED').length, 1);
    assert.deepEqual(METHOD_FILTERS.map((f) => f.label), ['All', 'Card', 'Cash', 'QR Pay', 'Bank Transfer', 'Refund due']);
    assert.equal(matchesMethodFilter({ method: 'ONLINE', refundDue: null }, 'CARD'), true);
    assert.equal(matchesMethodFilter({ method: 'QR_TRANSFER', refundDue: 100 }, 'REFUND_DUE'), true);
    assert.equal(matchesMethodFilter({ method: 'CASH', refundDue: null }, 'BANK_TRANSFER'), false);
    assert.match(billing, /aria-pressed=\{methodFilter === f\.value\}/);
    assert.match(billing, /\{PAYMENT_METHOD_LABEL\[p\.method\]\}/);
    assert.doesNotMatch(billing, /stripePaymentId|secret/i);
  });
});

describe('final balance and refunds', () => {
  const ended = (over) => booking({ status: 'ACTIVE', stage: 'BALANCE_DUE', endedAt: '2026-10-29T12:00:00',
    pendingTotalCost: 6500, payment: payment({ status: 'SUCCESS', ...over }) });

  it('asks for exactly the balance after the approved reimbursement, by QR or bank transfer', () => {
    const step = transferStep(ended({ balanceDue: 6250 }));
    assert.deepEqual(step, { kind: 'balance', amount: 6250, rejected: null });
    assert.match(panel, /<TransferInstructions method=\{method\} options=\{options\} amount=\{amount\} reference=\{b\.reference\} \/>/);
    assert.match(panel, /<ReceiptUpload booking=\{b\} method=\{method\} sendMethod onSubmitted=\{onChanged\} \/>/);
    assert.match(panel, /<DetailRow label="Adjusted final total">\{money\(b\.pendingTotalCost\)\}<\/DetailRow>/);
    assert.match(panel, /<DetailRow label="Already received">\{money\(p\.amount\)\}<\/DetailRow>/);
    assert.match(panel, /\{reimbursement > 0 && <DetailRow label="Approved repair reimbursement">−\{money\(reimbursement\)\}<\/DetailRow>\}/);
    assert.doesNotMatch(panel, /claimedAmount/);
  });

  it('lets a cash booking pay its balance by transfer, and the counter wait while a receipt is checked', () => {
    const cashEnded = ended({ method: 'CASH', balanceDue: 7750 });
    assert.equal(transferStep(cashEnded).kind, 'balance');
    assert.equal(cashAction(cashEnded, true).step, 'balance');
    const withReceipt = ended({ method: 'CASH', balanceDue: 7750, receipts: [receipt({ kind: 'BALANCE', amount: 7750 })] });
    assert.equal(cashAction(withReceipt, true), null, 'approve or reject the receipt first');
    assert.equal(isManualMethod('CASH'), true);
    assert.equal(isManualMethod('CARD'), false);
  });

  it('shows a refund due until an admin confirms the manual refund', () => {
    const due = ended({ refundDue: 100, method: 'BANK_TRANSFER' });
    assert.equal(manualRefundAction(due, false), null, 'never for a customer');
    const a = manualRefundAction(due, true);
    assert.equal(a.label, 'Confirm manual refund completed');
    assert.equal(a.amount, 100);
    assert.match(a.message, /This records the refund; it does not send any money\./);
    assert.equal(manualRefundAction(ended({ refundDue: 100, method: 'CASH' }), true), null, 'cash keeps its own refund');
    assert.match(panel, /api\.post<Booking>\(manualRefundPath\(b\.id\), \{\s*amount: action\.amount,\s*reference: reference\.trim\(\) \|\| null,\s*note: note\.trim\(\) \|\| null,/);
    assert.equal(manualRefundPath('b1'), '/admin/bookings/b1/manual-refund');
    assert.match(panel, /Refund due: <strong>\{money\(action\.amount\)\}<\/strong> \(not yet refunded\)/);
    assert.match(invoice, /<strong>Refund due \(not yet refunded\)<\/strong>/);
    assert.match(invoice, /<td colSpan=\{3\}>Refund completed<\/td>/);
  });
});

describe('customer payment history', () => {
  it('shows each receipt with its method, amount, status and times, without reviewer details', () => {
    assert.match(detail, /\{p\.receipts\.map\(\(r\) => \(/);
    assert.match(detail, /\{RECEIPT_STATUS_LABEL\[r\.status\]\}/);
    assert.match(detail, /Submitted \{dateTime\(r\.submittedAt\)\}/);
    assert.match(detail, /r\.status === 'APPROVED' && ` · approved \$\{dateTime\(r\.reviewedAt\)\}`/);
    assert.match(detail, /r\.status === 'REJECTED' && ` · rejected \$\{dateTime\(r\.reviewedAt\)\}: \$\{r\.rejectionReason\}`/);
    assert.doesNotMatch(detail.slice(detail.indexOf('function PaymentCard')), /reviewedBy/);
    assert.equal(PAYMENT_METHOD_LABEL.QR_TRANSFER, 'QR Pay');
    assert.equal(TRANSFER_LABEL.BANK_TRANSFER, 'Bank Transfer');
    assert.equal(transferPaymentLabel({ status: 'SUCCESS', method: 'BANK_TRANSFER' }), 'Bank Transfer received');
  });

  it('shows the transfer on the final invoice', () => {
    assert.match(invoice, /const transfer = invoice\.kind === 'FINAL' && isTransferMethod\(invoice\.paymentMethod\);/);
    assert.match(invoice, /<td colSpan=\{3\}>Already received<\/td>\s*<td className="num">\{money\(invoice\.amountReceived\)\}<\/td>/);
  });
});

describe('unchanged', () => {
  it('keeps the card checkout and the card balance panel for card bookings only', () => {
    assert.match(checkout, /\{method === 'CARD' && \(\s*<>\s*<div className="stripe-container">\s*<StripePayment/);
    assert.match(detail, /\/\/ A transfer balance is paid by QR or bank transfer with a receipt: the TransferPanel shows it\.\s*if \(isTransferBooking\(b\)\) return null;/);
  });

  it('keeps the cash flow and the demo controls', () => {
    assert.match(checkout, /api\.post<Booking>\(chooseCashPath\(b\.id\)\)/);
    assert.match(detail, /\{cash && \(\s*<CashPanel/);
    assert.match(detail, /<DemoControls\s+booking=\{b\}/);
    assert.match(read('demo.ts'), /export function demoActions/);
  });
});
