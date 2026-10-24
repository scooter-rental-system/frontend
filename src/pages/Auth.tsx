import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { ErrorAlert, FieldError } from '../components/ui';
import { useAction } from '../hooks';
import type { RegisterFormData, RegisterFormUI } from '../types';
import { isAdmin } from '../types';

// ─── Error message mapping ────────────────────────────────────────────────────

/**
 * Converts raw ApiError objects into friendly, user-facing messages.
 * Avoids exposing raw Spring/backend exception text in the UI.
 */
function friendlyAuthError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }

  switch (err.status) {
    case 400:
      // Field-level errors are shown per-field; fall back to the message
      return err.message || 'Please check the form and try again.';
    case 401:
      return 'Invalid email or password. Please try again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'Account not found.';
    case 409: {
      // Distinguish email vs NIC conflict from the backend message
      const msg = err.message?.toLowerCase() ?? '';
      if (msg.includes('nic'))   return 'This NIC number is already registered.';
      if (msg.includes('email')) return 'This email address is already registered.';
      return 'An account with these details already exists.';
    }
    case 500:
      return 'A server error occurred. Please try again in a moment.';
    default:
      return err.message || `Request failed (${err.status}).`;
  }
}

// ─── Shared helper ────────────────────────────────────────────────────────────

/** Reads the `from` redirect target stored by RequireAuth in location.state. */
function useRedirectTarget(fallback: string) {
  const location = useLocation();
  return (location.state as { from?: string } | null)?.from ?? fallback;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Login page — POST /api/auth/login
 *
 * Validation:
 *   • Email and password are required (HTML5 native + server-side)
 *   • Friendly error messages for all backend error codes
 *   • Redirects to the original page (or /admin for admin users) on success
 */
export function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const target    = useRedirectTarget('/');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [touched,  setTouched]  = useState({ email: false, password: false });

  const errors = {
    email:    touched.email    && !email    ? 'Email is required'    : '',
    password: touched.password && !password ? 'Password is required' : '',
  };

  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!email || !password) return;

    const user = await action.run(async () => {
      try {
        return await login(email, password);
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
    });

    if (user) {
      navigate(isAdmin(user.role) && target === '/' ? '/admin' : target, { replace: true });
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">🛵</div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your account to continue</p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={submit} noValidate id="login-form">
          <div className="form-group">
            <label htmlFor="login-email">
              Email address <span className="required">*</span>
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={!!errors.email}
              className={errors.email ? 'input-error' : ''}
            />
            <FieldError message={errors.email} />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">
              Password <span className="required">*</span>
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!errors.password}
              className={errors.password ? 'input-error' : ''}
            />
            <FieldError message={errors.password} />
          </div>

          {/* Server error */}
          <ErrorAlert error={action.error} />

          <button
            id="btn-login-submit"
            type="submit"
            className="btn-primary"
            disabled={action.busy}
          >
            {action.busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" state={{ from: target }} id="link-go-register">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Register ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: RegisterFormUI = {
  fullName:         '',
  email:            '',
  phone:            '',
  nicNumber:        '',
  password:         '',
  confirmPassword:  '',
  country:          '',
  idDocumentNumber: '',
  drivingLicenseNo: '',
};

type FormKey = keyof RegisterFormUI;

/**
 * Registration page — POST /api/auth/register
 *
 * Fields:
 *   Required:  Full name, Email, Phone, NIC Number, Password, Confirm Password
 *   Optional:  Passport / Other ID, Driving Licence, Country
 *
 * Validation:
 *   • Per-field messages shown after blur / submit attempt
 *   • NIC is required and validated as a separate field (not mixed with passport)
 *   • Password ≥ 8 characters; confirm must match
 *   • Friendly error messages for all backend error codes (400/409/500 etc.)
 *   • confirmPassword is stripped before the payload is sent to the backend
 */
export function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const target       = useRedirectTarget('/');

  const [form,    setForm]    = useState<RegisterFormUI>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<FormKey, boolean>>>({});

  const action = useAction();

  // Controlled field updater
  const set = (k: FormKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const blur = (k: FormKey) => () =>
    setTouched((t) => ({ ...t, [k]: true }));

  // Per-field validation (only after blur or submit attempt)
  const fieldError = (k: FormKey): string => {
    if (!touched[k]) return '';
    switch (k) {
      case 'fullName':
        return !form.fullName ? 'Full name is required' : '';
      case 'email':
        if (!form.email) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email address';
        return '';
      case 'phone':
        return !form.phone ? 'Phone number is required' : '';
      case 'nicNumber':
        if (!form.nicNumber) return 'NIC number is required';
        if (form.nicNumber.length > 20) return 'NIC number must be 20 characters or fewer';
        return '';
      case 'password':
        if (!form.password)           return 'Password is required';
        if (form.password.length < 8)  return 'Password must be at least 8 characters';
        if (form.password.length > 72) return 'Password must be 72 characters or fewer';
        return '';
      case 'confirmPassword':
        if (!form.confirmPassword)               return 'Please confirm your password';
        if (form.confirmPassword !== form.password) return 'Passwords do not match';
        return '';
      default:
        return '';
    }
  };

  const REQUIRED_FIELDS: FormKey[] = [
    'fullName', 'email', 'phone', 'nicNumber', 'password', 'confirmPassword',
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    // Touch all required fields to show validation messages
    const allTouched = REQUIRED_FIELDS.reduce(
      (acc, k) => ({ ...acc, [k]: true }),
      {} as Record<FormKey, boolean>,
    );
    setTouched(allTouched);

    // Guard: all required fields must be valid
    const hasError = REQUIRED_FIELDS.some((k) => {
      // Temporarily mark as touched for the check
      return fieldError(k) !== '' || !form[k];
    });
    if (hasError) return;
    if (form.password !== form.confirmPassword) return;

    // Strip confirmPassword — backend does not expect it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword: _ignored, ...payload } = form;
    const registerPayload: RegisterFormData = payload;

    const user = await action.run(async () => {
      try {
        return await register(registerPayload);
      } catch (err) {
        throw new Error(friendlyAuthError(err));
      }
    });

    if (user) navigate(target, { replace: true });
  };

  return (
    <div className="auth-container">
      <div className="auth-card auth-card--wide">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">🛵</div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Join us and start renting scooters today</p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={submit} noValidate id="register-form">
          <div className="form-grid">

            {/* Full name */}
            <div className="form-group">
              <label htmlFor="reg-fullName">
                Full name <span className="required">*</span>
              </label>
              <input
                id="reg-fullName"
                autoComplete="name"
                placeholder="As on your ID"
                value={form.fullName}
                onChange={set('fullName')}
                onBlur={blur('fullName')}
                aria-invalid={!!fieldError('fullName')}
                aria-describedby={fieldError('fullName') ? 'err-fullName' : undefined}
                className={fieldError('fullName') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('fullName')} />
            </div>

            {/* Email */}
            <div className="form-group">
              <label htmlFor="reg-email">
                Email address <span className="required">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
                aria-invalid={!!fieldError('email')}
                aria-describedby={fieldError('email') ? 'err-email' : undefined}
                className={fieldError('email') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('email')} />
            </div>

            {/* Phone */}
            <div className="form-group">
              <label htmlFor="reg-phone">
                Mobile (WhatsApp) <span className="required">*</span>
              </label>
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+94 77 …"
                value={form.phone}
                onChange={set('phone')}
                onBlur={blur('phone')}
                aria-invalid={!!fieldError('phone')}
                aria-describedby={fieldError('phone') ? 'err-phone' : undefined}
                className={fieldError('phone') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('phone')} />
            </div>

            {/* NIC Number — required by backend BE-027 */}
            <div className="form-group">
              <label htmlFor="reg-nicNumber">
                NIC Number <span className="required">*</span>
              </label>
              <input
                id="reg-nicNumber"
                autoComplete="off"
                placeholder="e.g. 200012345678V"
                maxLength={20}
                value={form.nicNumber}
                onChange={set('nicNumber')}
                onBlur={blur('nicNumber')}
                aria-invalid={!!fieldError('nicNumber')}
                aria-describedby={fieldError('nicNumber') ? 'err-nicNumber' : undefined}
                className={fieldError('nicNumber') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('nicNumber')} />
            </div>

            {/* Passport / Other ID — optional */}
            <div className="form-group">
              <label htmlFor="reg-idDoc">Passport / Other ID</label>
              <input
                id="reg-idDoc"
                autoComplete="off"
                placeholder="Passport or foreign ID no."
                value={form.idDocumentNumber}
                onChange={set('idDocumentNumber')}
              />
            </div>

            {/* Driving licence — optional */}
            <div className="form-group">
              <label htmlFor="reg-licence">Driving Licence / IDP no.</label>
              <input
                id="reg-licence"
                autoComplete="off"
                placeholder="e.g. B1234567"
                value={form.drivingLicenseNo}
                onChange={set('drivingLicenseNo')}
              />
            </div>

            {/* Country — optional */}
            <div className="form-group form-group--full">
              <label htmlFor="reg-country">Country</label>
              <input
                id="reg-country"
                autoComplete="country-name"
                placeholder="e.g. Sri Lanka"
                value={form.country}
                onChange={set('country')}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="reg-password">
                Password <span className="required">*</span>
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                placeholder="Min 8 characters"
                maxLength={72}
                value={form.password}
                onChange={set('password')}
                onBlur={blur('password')}
                aria-invalid={!!fieldError('password')}
                aria-describedby={fieldError('password') ? 'err-password' : undefined}
                className={fieldError('password') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('password')} />
            </div>

            {/* Confirm password */}
            <div className="form-group">
              <label htmlFor="reg-confirmPassword">
                Confirm Password <span className="required">*</span>
              </label>
              <input
                id="reg-confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                maxLength={72}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                onBlur={blur('confirmPassword')}
                aria-invalid={!!fieldError('confirmPassword')}
                aria-describedby={fieldError('confirmPassword') ? 'err-confirmPassword' : undefined}
                className={fieldError('confirmPassword') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('confirmPassword')} />
            </div>

          </div>

          {/* Server error */}
          <ErrorAlert error={action.error} />

          <p className="required-note">
            <span className="required">*</span> Required fields
          </p>

          <button
            id="btn-register-submit"
            type="submit"
            className="btn-primary"
            disabled={action.busy}
          >
            {action.busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" state={{ from: target }} id="link-go-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
