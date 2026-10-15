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
