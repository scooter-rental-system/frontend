import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorAlert, FieldError } from '../components/ui';
import { useAction } from '../hooks';
import type { RegisterFormData } from '../types';
import { isAdmin } from '../types';

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
 *   • Shows server error message on failure
 *   • Redirects to the original page (or /admin for admin users) on success
 */
export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget('/');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Field-level validation state
  const [touched, setTouched] = useState({ email: false, password: false });
  const errors = {
    email:    touched.email    && !email    ? 'Email is required'    : '',
    password: touched.password && !password ? 'Password is required' : '',
  };

  const action = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Mark all fields as touched to show validation messages
    setTouched({ email: true, password: true });
    if (!email || !password) return;

    const user = await action.run(() => login(email, password));
    if (user) {
      navigate(isAdmin(user.role) && target === '/' ? '/admin' : target, {
        replace: true,
      });
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
            <label htmlFor="login-email">Email address</label>
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
            <label htmlFor="login-password">Password</label>
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

const INITIAL_FORM: RegisterFormData = {
  fullName:         '',
  email:            '',
  phone:            '',
  password:         '',
  country:          '',
  idDocumentNumber: '',
  drivingLicenseNo: '',
};

/**
 * Registration page — POST /api/auth/register
 *
 * Validation:
 *   • Required: Full name, Email, Phone, Password (≥ 8 chars)
 *   • Optional: Country, NIC/Passport, Driving licence
 *   • Shows per-field messages and a server-level error alert
 */
export function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const target       = useRedirectTarget('/');

  const [form, setForm]     = useState<RegisterFormData>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof RegisterFormData, boolean>>>({});

  const action = useAction();

  // Controlled field updater
  const set =
    (k: keyof RegisterFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const blur = (k: keyof RegisterFormData) => () =>
    setTouched((t) => ({ ...t, [k]: true }));

  // Per-field validation messages (only shown after blur / submit attempt)
  const fieldError = (k: keyof RegisterFormData): string => {
    if (!touched[k]) return '';
    if (k === 'fullName'  && !form.fullName)  return 'Full name is required';
    if (k === 'email'     && !form.email)     return 'Email is required';
    if (k === 'phone'     && !form.phone)     return 'Phone number is required';
    if (k === 'password') {
      if (!form.password)         return 'Password is required';
      if (form.password.length < 8) return 'Password must be at least 8 characters';
    }
    return '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Touch all required fields
    setTouched({ fullName: true, email: true, phone: true, password: true });
    if (
      !form.fullName ||
      !form.email    ||
      !form.phone    ||
      !form.password ||
      form.password.length < 8
    ) return;

    const user = await action.run(() => register(form));
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
                className={fieldError('phone') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('phone')} />
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
                value={form.password}
                onChange={set('password')}
                onBlur={blur('password')}
                aria-invalid={!!fieldError('password')}
                className={fieldError('password') ? 'input-error' : ''}
              />
              <FieldError message={fieldError('password')} />
            </div>

            {/* Country (optional) */}
            <div className="form-group">
              <label htmlFor="reg-country">Country</label>
              <input
                id="reg-country"
                autoComplete="country-name"
                placeholder="e.g. Sri Lanka"
                value={form.country}
                onChange={set('country')}
              />
            </div>

            {/* NIC / Passport (optional) */}
            <div className="form-group">
              <label htmlFor="reg-idDoc">NIC / Passport no.</label>
              <input
                id="reg-idDoc"
                placeholder="e.g. 200012345678"
                value={form.idDocumentNumber}
                onChange={set('idDocumentNumber')}
              />
            </div>

            {/* Driving licence (optional) */}
            <div className="form-group form-group--full">
              <label htmlFor="reg-licence">Driving licence / IDP no.</label>
              <input
                id="reg-licence"
                placeholder="e.g. B1234567"
                value={form.drivingLicenseNo}
                onChange={set('drivingLicenseNo')}
              />
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
