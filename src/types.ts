// ─── User & Auth ────────────────────────────────────────────────────────────

/** User roles supported by the backend. SUPER_ADMIN has all ADMIN rights. */
export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export const isAdmin = (role: Role | undefined) =>
  role === 'ADMIN' || role === 'SUPER_ADMIN';

/** Authenticated user entity returned by the backend. */
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

/** Response from POST /api/auth/login and POST /api/auth/register. */
export interface AuthResponse {
  token: string;
  user: User;
}

// ─── Registration form fields ────────────────────────────────────────────────

export interface RegisterFormData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  country: string;
  idDocumentNumber: string;
  drivingLicenseNo: string;
}

// ─── Scooters & Gear ─────────────────────────────────────────────────────────

export type ScooterStatus = 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';

export interface Scooter {
  id: string;
  code: string;
  model: string;
  plateNumber: string;
  engineCc: number | null;
  description: string;
  imageUrl: string | null;
  hourlyRate: number;
  perKmRate: number;
  available: boolean;
  status: ScooterStatus;
}

export interface GearItem {
  id: string;
  name: string;
  description: string;
  category: string;
  dailyRate: number;
  totalQuantity: number;
  available: number | null;
}

/** Price estimate returned by POST /api/bookings/quote. */
export interface Quote {
  hourlyRate: number;
  perKmRate: number;
  gear: { gearItemId: string; name: string; quantity: number; lineTotal: number }[];
  /** 1 started hour + 1 started day of gear: paid now. */
  initialCharge: number;
}

// ─── Bookings ────────────────────────────────────────────────────────────────

/** SDS 3.2: PENDING → ACTIVE → COMPLETED, or CANCELLED. */
export type BookingStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** Display stage derived on the server from status, payment and times (BookingDtos.Stage). */
export type BookingStage =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'BALANCE_DUE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

/** Mirrors the backend's BookingDtos.BookingResponse. */
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
    hourlyRate: number;
    perKmRate: number;
  };
  startTime: string;
  endTime: string | null;
  billableHours: number | null;
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
  method: 'CARD' | 'ONLINE';
  status: PaymentStatus;
  provider: string;
  stripePaymentId: string | null;
  cardLast4: string | null;
  balanceDue: number | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
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
  activeBookingReference: string | null;
  riderName: string | null;
  distanceFromBaseKm: number;
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: string;
}

export interface Tracking {
  position: LivePosition;
  trail: TrailPoint[];
  /** Along the trail; for a booking, the rental so far. */
  distanceKm: number;
}
