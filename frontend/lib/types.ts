// API shapes for the customer dashboard. Booking types mirror the backend's
// BookingDtos.BookingResponse; User mirrors the planned GET /api/me response.

/** SDS 3.2 UserRole. */
export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

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

/** SDS 3.2: PENDING -> ACTIVE -> COMPLETED, or CANCELLED. */
export type BookingStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/** Display stage derived on the server from status, payment and times (BookingDtos.Stage). */
export type BookingStage =
  | "AWAITING_PAYMENT"
  | "PAYMENT_FAILED"
  | "UPCOMING"
  | "IN_PROGRESS"
  | "BALANCE_DUE"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

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
  /** Balance due only: the frozen settlement (endTime and totalCost stay null until COMPLETED). */
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
  dropLocation: string | null;
  notes: string | null;
  contractSigned: boolean;
  cancelledAt: string | null;
  createdAt: string;
}
