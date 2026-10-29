/**
 * QR payments and bank transfers (backend BE-045). The customer transfers the money in their own banking or payment
 * app and uploads the receipt; this application never moves the money. A receipt only waits for verification: the
 * payment counts as received when an administrator approves it after checking the business account. These helpers
 * describe the state the backend returned and pick the one admin action that applies. Kept free of React and of
 * runtime imports so `npm test` can run them directly.
 */
import type {
  AdminReceipt,
  Booking,
  Invoice,
  Payment,
  PaymentMethod,
  PaymentOptions,
  PaymentSettings,
  ReceiptStatus,
  ReceiptSummary,
} from './types';

// Same formatting as format.ts money(); a local copy because Node's test runner loads this file without a bundler.
const lkr = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const money = (n: number) => lkr.format(n);

export type TransferMethod = 'QR_TRANSFER' | 'BANK_TRANSFER';

export const TRANSFER_METHODS: readonly TransferMethod[] = ['QR_TRANSFER', 'BANK_TRANSFER'];

/** The checkout option. */
export const TRANSFER_LABEL: Record<TransferMethod, string> = {
  QR_TRANSFER: 'QR Pay',
  BANK_TRANSFER: 'Bank Transfer',
};

/** The method inside a sentence ("your QR payment of …"). */
export const TRANSFER_NAME: Record<TransferMethod, string> = {
  QR_TRANSFER: 'QR payment',
  BANK_TRANSFER: 'bank transfer',
};

/** Every method the backend can return, as an admin or customer reads it. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: 'Card',
  ONLINE: 'Online',
  CASH: 'Cash',
  QR_TRANSFER: 'QR Pay',
  BANK_TRANSFER: 'Bank Transfer',
};

export const isTransferMethod = (m: PaymentMethod | null | undefined): m is TransferMethod =>
  m === 'QR_TRANSFER' || m === 'BANK_TRANSFER';

/** Paid at the counter or by transfer, so an administrator records or approves every amount. */
export const isManualMethod = (m: PaymentMethod | null | undefined) => m === 'CASH' || isTransferMethod(m);

export const isTransferBooking = (b: Pick<Booking, 'payment'>) => isTransferMethod(b.payment?.method);

/** The transfer methods an administrator enabled, in checkout order; none when the options are not loaded. */
export function offeredTransfers(options: PaymentOptions | null | undefined): TransferMethod[] {
  if (!options) return [];
  return TRANSFER_METHODS.filter((m) => (m === 'QR_TRANSFER' ? options.qr != null : options.bank != null));
}

// ─── Customer wording ────────────────────────────────────────────────────────

export const TRANSFER_REFERENCE_NOTE = 'Use the booking reference when making the transfer.';

export const TRANSFER_OUTSIDE_NOTE =
  'Make the transfer in your own banking or payment app. This app does not move the money: an administrator checks that it reached our account before your booking is confirmed.';

export const RECEIPT_WAITING = 'Receipt submitted. Waiting for administrator verification.';

export const TRANSFER_END_NOTE =
  'The final total is calculated. Transfer any remaining balance by QR Pay or bank transfer and upload the receipt (or pay at the rental counter); if you paid more than the final total, our team refunds the difference to you.';

export const TRANSFER_CANCEL_NOTE =
  'Cancel this booking? The amount you transferred is refunded to you by our team from the business account.';

export function verificationHoldNote(options: Pick<PaymentOptions, 'paymentHoldMinutes' | 'verificationHoldMinutes'>) {
  return `Upload your receipt within ${options.paymentHoldMinutes} minutes of booking. Once it is submitted, the scooter stays reserved for up to ${hours(options.verificationHoldMinutes)} while we verify it.`;
}

const hours = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  PENDING_VERIFICATION: 'Waiting for verification',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Not verified in time',
};

export const RECEIPT_STATUS_TONE: Record<ReceiptStatus, 'amber' | 'green' | 'red' | ''> = {
  PENDING_VERIFICATION: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  EXPIRED: '',
};

/** What happened to a transfer payment, in words. Only an administrator's approval makes it received. */
export function transferPaymentLabel(p: Pick<Payment, 'status' | 'method'> & { receipts?: ReceiptSummary[] }) {
  const name = isTransferMethod(p.method) ? TRANSFER_LABEL[p.method] : 'Transfer';
  switch (p.status) {
    case 'SUCCESS':
      return `${name} received`;
    case 'REFUNDED':
      return `${name} refunded`;
    case 'FAILED':
      return `${name} not received`;
    case 'PENDING':
      return pendingReceipt(p.receipts) ? `${name} receipt waiting for verification` : `${name} pending`;
  }
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export const pendingReceipt = (receipts: readonly ReceiptSummary[] | undefined | null) =>
  receipts?.find((r) => r.status === 'PENDING_VERIFICATION') ?? null;

/** The latest receipt of one kind (initial payment or final balance). */
export function latestReceipt(receipts: readonly ReceiptSummary[] | undefined | null, kind: ReceiptSummary['kind']) {
  const ofKind = (receipts ?? []).filter((r) => r.kind === kind);
  return ofKind.length ? ofKind[ofKind.length - 1] : null;
}

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const RECEIPT_ACCEPT = RECEIPT_TYPES.join(',');
const RECEIPT_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
export const RECEIPT_HINT = 'A photo or screenshot of the receipt: JPEG, PNG or WebP, up to 5 MB.';

/** Why a chosen file cannot be uploaded as a receipt, or null when it can (the server checks the content again). */
export function receiptProblem(file: { name: string; type: string; size: number } | null): string | null {
  if (!file) return 'Attach a photo or screenshot of the payment receipt.';
  if (file.size === 0) return `${file.name} is empty.`;
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type) || !RECEIPT_EXTENSIONS.test(file.name)) {
    return `${file.name} is not a JPEG, PNG or WebP image.`;
  }
  if (file.size > MAX_RECEIPT_BYTES) return `${file.name} is larger than 5 MB.`;
  return null;
}

/** The optional transaction reference: one line, at most 100 characters. */
export function referenceProblem(reference: string): string | null {
  if (reference.trim().length > 100) return 'The transaction reference can be at most 100 characters.';
  return null;
}

/**
 * What the customer can do about a transfer now: pay the initial charge (or upload a new receipt after a
 * rejection), pay the final balance, or wait for verification. Null when nothing is due by transfer.
 */
export type TransferStep =
  | { kind: 'initial'; amount: number; rejected: ReceiptSummary | null }
  | { kind: 'balance'; amount: number; rejected: ReceiptSummary | null }
  | { kind: 'waiting'; receipt: ReceiptSummary };

export function transferStep(b: Booking): TransferStep | null {
  const p = b.payment;
  if (!p) return null;
  const waiting = pendingReceipt(p.receipts);
  if (b.status === 'PENDING' && p.status === 'PENDING' && isTransferMethod(p.method)) {
    if (waiting) return { kind: 'waiting', receipt: waiting };
    const last = latestReceipt(p.receipts, 'INITIAL');
    return { kind: 'initial', amount: p.amount, rejected: last?.status === 'REJECTED' ? last : null };
  }
  if (b.status === 'ACTIVE' && b.endedAt && p.balanceDue != null && isManualMethod(p.method)) {
    if (waiting) return { kind: 'waiting', receipt: waiting };
    const last = latestReceipt(p.receipts, 'BALANCE');
    return { kind: 'balance', amount: p.balanceDue, rejected: last?.status === 'REJECTED' ? last : null };
  }
  return null;
}

/**
 * The status badge of an invoice. A final invoice takes the payment's status, but while a balance or a refund is
 * still due the payment of the first charge being SUCCESS does not mean the bill is settled.
 */
export function invoiceStatus(
  invoice: Pick<Invoice, 'kind' | 'status' | 'paymentStatus' | 'balanceDue' | 'refundDue'>,
): string | null {
  if (invoice.kind !== 'FINAL' || invoice.status === 'VOID') return invoice.status;
  if (invoice.refundDue != null) return 'REFUND_DUE';
  if (invoice.balanceDue != null) return 'BALANCE_DUE';
  return invoice.paymentStatus;
}

// ─── Admin actions ───────────────────────────────────────────────────────────

export interface ReceiptApproval {
  label: string;
  title: string;
  message: string;
}

/**
 * The approval of one receipt: "Approve payment" for the initial payment, "Approve final payment" for the balance.
 * Only for a receipt waiting for verification whose amount the booking still expects.
 */
export function receiptApproval(r: AdminReceipt): ReceiptApproval | null {
  if (r.status !== 'PENDING_VERIFICATION' || r.amountDue == null || r.amountDue !== r.amount) return null;
  const what = TRANSFER_NAME[r.method];
  if (r.kind === 'INITIAL') {
    return {
      label: 'Approve payment',
      title: 'Approve payment?',
      message: `Approve only after you have checked that ${money(r.amount)} by ${what} reached the business account with reference ${r.bookingReference}. The booking becomes active and the scooter is marked rented.`,
    };
  }
  return {
    label: 'Approve final payment',
    title: 'Approve final payment?',
    message: `Approve only after you have checked that the final ${money(r.amount)} by ${what} reached the business account. The rental is then completed.`,
  };
}

/** Common reasons, offered as a starting point; the admin can write their own. */
export const REJECTION_REASONS = [
  'Incorrect amount',
  'Unreadable receipt',
  'Transaction not found',
  'Wrong account or reference',
] as const;

export interface ManualRefundAction {
  amount: number;
  label: string;
  title: string;
  message: string;
}

/** "Confirm manual refund completed": a refund due on a QR or bank transfer payment, for an admin only. */
export function manualRefundAction(b: Booking, admin: boolean): ManualRefundAction | null {
  const p = b.payment;
  if (!admin || !p || !isTransferMethod(p.method) || p.refundDue == null) return null;
  return {
    amount: p.refundDue,
    label: 'Confirm manual refund completed',
    title: 'Confirm manual refund completed?',
    message: `Confirm only after you have sent ${money(p.refundDue)} back to ${b.customer.fullName} from the business account. This records the refund; it does not send any money.`,
  };
}

// ─── Admin payments page ─────────────────────────────────────────────────────

export type MethodFilter = 'ALL' | 'CARD' | 'CASH' | 'QR_TRANSFER' | 'BANK_TRANSFER' | 'REFUND_DUE';

export const METHOD_FILTERS: { value: MethodFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'CARD', label: 'Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'QR_TRANSFER', label: 'QR Pay' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'REFUND_DUE', label: 'Refund due' },
];

export function matchesMethodFilter(p: Pick<Payment, 'method' | 'refundDue'>, filter: MethodFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'CARD':
      return p.method === 'CARD' || p.method === 'ONLINE';
    case 'REFUND_DUE':
      return p.refundDue != null;
    default:
      return p.method === filter;
  }
}

export type ReceiptFilter = 'ALL' | ReceiptStatus;

export const RECEIPT_FILTERS: { value: ReceiptFilter; label: string }[] = [
  { value: 'PENDING_VERIFICATION', label: 'Pending verification' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

export const filterReceipts = (receipts: readonly AdminReceipt[], filter: ReceiptFilter) =>
  receipts.filter((r) => filter === 'ALL' || r.status === filter);

// ─── Payment settings ────────────────────────────────────────────────────────

export type SettingsForm = Omit<PaymentSettings, 'qrImageUploaded' | 'updatedAt' | 'updatedBy'>;

export const settingsForm = (s: PaymentSettings): SettingsForm => ({
  qrEnabled: s.qrEnabled,
  qrDisplayName: s.qrDisplayName ?? '',
  qrInstructions: s.qrInstructions ?? '',
  bankEnabled: s.bankEnabled,
  bankName: s.bankName ?? '',
  bankAccountHolder: s.bankAccountHolder ?? '',
  bankAccountNumber: s.bankAccountNumber ?? '',
  bankBranch: s.bankBranch ?? '',
  bankBranchCode: s.bankBranchCode ?? '',
  bankInstructions: s.bankInstructions ?? '',
});

const ACCOUNT_NUMBER = /^[0-9][0-9 -]{2,32}[0-9]$/;
const BRANCH_CODE = /^[0-9A-Za-z-]{1,10}$/;

/** Why the settings cannot be saved, or null (the server checks them again). */
export function settingsProblem(f: SettingsForm, qrImageUploaded: boolean): string | null {
  const blank = (s: string | null) => !s || !s.trim();
  if (f.qrEnabled && !qrImageUploaded) return 'Upload the QR image before enabling QR payments.';
  if (f.qrEnabled && blank(f.qrDisplayName)) return 'Enter the name shown with the QR code before enabling QR payments.';
  if (f.bankEnabled && [f.bankName, f.bankAccountHolder, f.bankAccountNumber, f.bankBranch].some(blank)) {
    return 'Enter the bank, account holder, account number and branch before enabling bank transfers.';
  }
  if (!blank(f.bankAccountNumber) && !ACCOUNT_NUMBER.test(f.bankAccountNumber!.trim())) {
    return 'The account number may contain only digits, spaces and hyphens.';
  }
  if (!blank(f.bankBranchCode) && !BRANCH_CODE.test(f.bankBranchCode!.trim())) {
    return 'The branch code may contain only letters, digits and hyphens.';
  }
  return null;
}

/** Shown on the settings page: only public receiving details belong here. */
export const SETTINGS_SAFETY_NOTE =
  'Only enter the public details customers need to pay you. Never enter an online banking password, PIN, OTP, card number or banking login: this page has no place for them and the business never needs to share them.';

// ─── API paths ───────────────────────────────────────────────────────────────

export const PAYMENT_OPTIONS_PATH = '/payments/options';
export const QR_IMAGE_PATH = '/payments/options/qr-image';
export const PAYMENT_SETTINGS_PATH = '/admin/payment-settings';
export const ADMIN_QR_IMAGE_PATH = '/admin/payment-settings/qr-image';
export const ADMIN_RECEIPTS_PATH = '/admin/payment-receipts';

const id = (s: string) => encodeURIComponent(s);
export const chooseTransferPath = (bookingId: string) => `/bookings/${id(bookingId)}/transfer`;
export const receiptsPath = (bookingId: string) => `/bookings/${id(bookingId)}/receipts`;
export const receiptImagePath = (receiptId: string) => `/payment-receipts/${id(receiptId)}/image`;
export const approveReceiptPath = (receiptId: string) => `/admin/payment-receipts/${id(receiptId)}/approve`;
export const rejectReceiptPath = (receiptId: string) => `/admin/payment-receipts/${id(receiptId)}/reject`;
export const manualRefundPath = (bookingId: string) => `/admin/bookings/${id(bookingId)}/manual-refund`;
