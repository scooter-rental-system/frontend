// SDS 3.2 UserRole. SUPER_ADMIN has every ADMIN right.
export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export const isAdmin = (role: Role | undefined) => role === 'ADMIN' || role === 'SUPER_ADMIN';

// Entity ids are UUIDs, sent as strings (SDS 2.2).
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  idDocumentNumber: string | null;
  drivingLicenseNo: string | null;
  country: string | null;
  active: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterFormData {
  fullName: string;
  email: string;
  phone: string;
  /** Sri Lankan NIC — required by backend (BE-027). */
  nicNumber: string;
  password: string;
  country: string;
  /** Passport / other ID — optional. */
  idDocumentNumber: string;
  drivingLicenseNo: string;
  /** SDS 8.5: explicit consent to store the personal data on the form; the backend requires true (BE-035). */
  consent: boolean;
}

/** Frontend-only: confirm password is validated in the form and stripped before sending. */
export type RegisterFormUI = RegisterFormData & { confirmPassword: string };

export type ScooterStatus = 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';

export interface Scooter {
  id: string;
  code: string;
  model: string;
  plateNumber: string;
  engineCc: number | null;
  status: ScooterStatus;
  /** LKR per full 24 hours (and per remainder of more than 8 hours); see pricing.ts. */
  dailyRate: number;
  /** LKR per extra started hour, for a remainder of up to 8 hours after the full days. */
  hourlyRate: number;
  /** LKR per km from the GPS log. */
  perKmRate: number;
  /** SDS 2.2: cumulative km (decimal). */
  totalMileage: number;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  description: string | null;
  /** Soft-deleted: removed from the fleet (SDS 8.3). */
  deleted: boolean;
  /** Bookable right now (not rented, in maintenance or held by another booking). */
  available: boolean;
}

export type GearCategory = 'CAMPING' | 'SAFETY' | 'LUGGAGE' | 'ACCESSORY';

export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  description: string | null;
  dailyRate: number;
  totalQuantity: number;
  available: number | null;
  active: boolean;
}

/** Rates and the initial charge (1 hour + 1 gear day); the total is known when the rental ends. */
export interface Quote {
  scooterId: string;
  currency: string;
  dailyRate: number;
  /** The extra-hour rate. */
  hourlyRate: number;
  perKmRate: number;
  gear: { gearItemId: string; name: string; quantity: number; dailyRate: number; days: number; lineTotal: number }[];
  gearPerDay: number;
  initialCharge: number;
}

// SDS 3.2, with the pickup step: READY_FOR_PICKUP once paid; ACTIVE from the actual start (the admin handover with
// the starting odometer, then the customer's start confirmation) until the rental is settled.
export type BookingStatus = 'PENDING' | 'READY_FOR_PICKUP' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** Display stage derived on the server from status, payment and times. */
export type BookingStage =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'READY_FOR_PICKUP'
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'BALANCE_DUE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

/**
 * CARD/ONLINE go through the card provider; QR_TRANSFER and BANK_TRANSFER are approved by an admin from the receipt;
 * CASH is received at the rental counter and recorded by an admin (never chosen by the customer).
 */
export type PaymentMethod = 'CARD' | 'ONLINE' | 'CASH' | 'QR_TRANSFER' | 'BANK_TRANSFER';

export type ReceiptStatus = 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/** A QR payment or bank transfer receipt the customer uploaded, as the customer sees it (no reviewer details). */
export interface ReceiptSummary {
  id: string;
  kind: 'INITIAL' | 'BALANCE';
  method: 'QR_TRANSFER' | 'BANK_TRANSFER';
  amount: number;
  transferReference: string | null;
  status: ReceiptStatus;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/** GET /api/admin/payment-receipts: a receipt with its booking and customer, for verification. */
export interface AdminReceipt extends ReceiptSummary {
  bookingId: string;
  bookingReference: string;
  bookingStatus: BookingStatus;
  customerName: string;
  customerEmail: string;
  /** What the booking expects for this step now; null when nothing is due any more. */
  amountDue: number | null;
  reviewedBy: string | null;
}

/** GET /api/payments/options: the transfer methods offered now; null when disabled. */
export interface PaymentOptions {
  qr: { displayName: string; instructions: string | null } | null;
  bank: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branch: string;
    branchCode: string | null;
    instructions: string | null;
  } | null;
  paymentHoldMinutes: number;
  verificationHoldMinutes: number;
}

/** GET/PUT /api/admin/payment-settings: public payment-receiving details only. */
export interface PaymentSettings {
  qrEnabled: boolean;
  qrDisplayName: string | null;
  qrInstructions: string | null;
  qrImageUploaded: boolean;
  bankEnabled: boolean;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  bankBranchCode: string | null;
  bankInstructions: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Booking {
  id: string;
  reference: string;
  status: BookingStatus;
  stage: BookingStage;
  customer: { id: string; fullName: string; email: string; phone: string | null };
  scooter: {
    id: string;
    code: string;
    model: string;
    plateNumber: string;
    imageUrl: string | null;
    dailyRate: number;
    /** The extra-hour rate. */
    hourlyRate: number;
    perKmRate: number;
  };
  /** The planned pickup time the customer chose. */
  startTime: string;
  /** When the rental really started (server time); null until the customer confirms the start. */
  actualStartTime: string | null;
  /** When an admin confirmed handing the scooter over, with the starting odometer. */
  handoverConfirmedAt: string | null;
  handoverConfirmedBy: string | null;
  customerStartConfirmedAt: string | null;
  /** Odometer readings (km) entered by an admin at handover and return; the billed distance is the difference. */
  startOdometerKm: number | null;
  endOdometerKm: number | null;
  endTime: string | null;
  billableHours: number | null;
  /** How the ended rental is charged (null until it ends): days, extra hours and the distance allowance. */
  breakdown: { chargedDays: number; extraHours: number; includedKm: number; excessKm: number } | null;
  /** The billed distance (the odometer difference), set when the rental is completed. */
  distanceKm: number | null;
  totalCost: number | null;
  /** Balance due only: frozen settlement (endTime and totalCost stay null until COMPLETED, SDS 2.2). */
  endedAt: string | null;
  pendingDistanceKm: number | null;
  pendingTotalCost: number | null;
  initialCharge: number;
  gear: { gearItemId: string; name: string; quantity: number; dailyRate: number }[];
  payment: {
    status: PaymentStatus;
    amount: number;
    balanceDue: number | null;
    cardLast4: string | null;
    failureReason: string | null;
    paidAt: string | null;
    method: PaymentMethod;
    /** Cash, QR or bank transfer: money still owed back to the customer. */
    refundDue: number | null;
    /** QR and bank transfer receipts, oldest first (empty for card and cash). */
    receipts: ReceiptSummary[];
  } | null;
  pickupLocation: string;
  /** SDS 2.2: GPS position where the rental ended; null until it completes. */
  dropLocation: string | null;
  notes: string | null;
  contractSigned: boolean;
  cancelledAt: string | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  termsVersion: string;
  termsText: string;
  signed: boolean;
  signedName: string | null;
  signedAt: string | null;
}

/** One payment per booking (SDS 2.3). */
export interface Payment {
  id: string;
  bookingId: string;
  bookingReference: string | null;
  customerName: string | null;
  amount: number;
  method: 'CARD' | 'ONLINE' | 'CASH' | 'QR_TRANSFER' | 'BANK_TRANSFER';
  status: PaymentStatus;
  /** Null for cash: no payment provider is involved. */
  provider: string | null;
  stripePaymentId: string | null;
  cardLast4: string | null;
  balanceDue: number | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Cash, QR or bank transfer: money still owed back to the customer. */
  refundDue: number | null;
  /** Every way money was received, in order, e.g. ['QR_TRANSFER', 'CASH']; `method` stays the first. */
  paymentMethods: PaymentMethod[];
  /** Every amount recorded, oldest first; only for a single booking (GET /bookings/{id}/payment), null in lists. */
  transactions: PaymentTransaction[] | null;
}

/** One amount on a payment: received (INITIAL, BALANCE) or refunded (REFUND), and how it moved. */
export interface PaymentTransaction {
  id: string;
  kind: 'INITIAL' | 'BALANCE' | 'REFUND';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  /** The admin who recorded or approved a manual amount; null for provider transactions. */
  recordedBy: string | null;
  method: PaymentMethod | null;
}

/** GET /api/payments/config. The publishable key is public by design; secret keys never reach the browser. */
export interface PaymentConfig {
  available: boolean;
  provider: string | null;
  publishableKey: string | null;
  currency: string;
}

/** What the browser needs to confirm a payment with the provider (Stripe PaymentIntent shape). */
export interface PaymentIntent {
  paymentId: string;
  bookingId: string;
  purpose: 'INITIAL' | 'BALANCE';
  intentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  provider: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  /** FINAL is issued when a rental ends; RENTAL / SETTLEMENT are from the earlier model. */
  kind: 'FINAL' | 'RENTAL' | 'SETTLEMENT';
  /** Earlier invoices only. */
  status: 'ISSUED' | 'PAID' | 'VOID' | null;
  paymentStatus: PaymentStatus | null;
  balanceDue: number | null;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  issuedAt: string;
  lines: { description: string; quantity: number; unitPrice: number; amount: number }[];
  /** How the booking is paid; null when there is no payment (a viva demo rental). */
  paymentMethod: PaymentMethod | null;
  /** Final invoice paid in cash: cash recorded as received, and as handed back. */
  cashReceived: number | null;
  cashRefunded: number | null;
  /** Final invoice paid in cash or by QR or bank transfer: money still owed back. */
  refundDue: number | null;
  /** Final invoice paid in cash or by QR or bank transfer: everything received, and refunded so far. */
  amountReceived: number | null;
  amountRefunded: number | null;
  /** Every way money was received, in order, e.g. ['QR_TRANSFER', 'CASH']; empty when there is no payment. */
  paymentMethods: PaymentMethod[];
}

export interface Notification {
  id: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  recipient: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  subject: string;
  status: 'SENT' | 'FAILED';
  createdAt: string;
}

export interface MaintenanceRecord {
  id: string;
  scooterId: string;
  scooterCode: string;
  scooterModel: string;
  type: 'SERVICE' | 'REPAIR' | 'INSPECTION';
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  description: string;
  cost: number | null;
  scheduledDate: string | null;
  completedDate: string | null;
  odometerKm: number | null;
  createdAt: string;
}

export interface LivePosition {
  scooterId: string;
  code: string;
  model: string;
  plateNumber: string;
  status: ScooterStatus;
  latitude: number | null;
  longitude: number | null;
  lastSeen: string | null;
  /** The rental under way on this scooter (opens its GPS history for admins). */
  activeBookingId: string | null;
  activeBookingReference: string | null;
  riderName: string | null;
  distanceFromBaseKm: number;
  /** No report for 2 minutes (or never): the position is the last real one, not a live one. */
  stale: boolean;
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: string;
}

/** GET /api/admin/gps/bookings/{id}/history: one rental's stored route, in time order (admin only). */
export interface BookingGpsHistory {
  bookingId: string;
  reference: string;
  customerName: string;
  scooterCode: string;
  scooterModel: string;
  plateNumber: string;
  status: BookingStatus;
  start: string;
  end: string | null;
  points: TrailPoint[];
  distanceKm: number;
}

export type RepairStatus = 'REPORTED' | 'ASSISTANCE_ARRANGED' | 'UNDER_REVIEW' | 'RESOLVED';

/** A photo attached to a repair report; fetched through the authorised photo endpoint only. */
export interface RepairPhoto {
  id: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * A repair/breakdown report on a rental. The approved amount (set by an admin) is deducted from the final bill once
 * the report is RESOLVED; the customer's claimed amount never is.
 */
export interface RepairReport {
  id: string;
  bookingId: string;
  bookingReference: string;
  customerName: string;
  customerPhone: string | null;
  scooterCode: string;
  scooterModel: string;
  plateNumber: string;
  description: string;
  selfArranged: boolean;
  claimedAmount: number | null;
  approvedAmount: number | null;
  status: RepairStatus;
  adminNote: string | null;
  reportedAt: string;
  updatedAt: string;
  photos: RepairPhoto[];
}

/** GET /api/support/contact: configured support details; null when not configured. */
export interface SupportContact {
  phone: string | null;
  email: string | null;
}

export interface Tracking {
  position: LivePosition;
  trail: TrailPoint[];
  /** Along the trail; for a booking, the rental so far. */
  distanceKm: number;
}

export interface Dashboard {
  fleetByStatus: Record<ScooterStatus, number>;
  activeRentals: number;
  upcoming: number;
  balanceDue: number;
  pendingPayment: number;
  openMaintenance: number;
  customers: number;
  revenueLast30Days: number;
  currency: string;
}

export interface ReportSummary {
  from: string;
  to: string;
  currency: string;
  revenue: number;
  refunds: number;
  outstandingBalance: number;
  maintenanceCost: number;
  bookingsCreated: number;
  bookingsByStatus: Record<BookingStatus, number>;
  newCustomers: number;
  fleetUtilizationPct: number;
  revenueByDay: { date: string; amount: number }[];
  scooters: { scooterId: string; code: string; model: string; bookings: number; rentedHours: number; revenue: number }[];
  gear: { name: string; units: number }[];
}

/** SDS 4.3 / 5.2: a crossing above 60 km/h. */
export interface SpeedViolation {
  id: string;
  scooterCode: string;
  scooterModel: string;
  plateNumber: string;
  bookingReference: string | null;
  riderName: string | null;
  speedKmh: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
}
