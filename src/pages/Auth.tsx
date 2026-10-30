import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { BrandMark, ErrorAlert, FieldError, ScooterIllustration } from '../components/ui';
import { useAction } from '../hooks';
import {
  confirmPasswordError, emailError, forgotFailure, MISSING_TOKEN, newPasswordError, REQUEST_ACCEPTED, RESET_DONE,
  resetFailure, resetTokenFrom,
} from '../passwordReset';
import { consentError, nicError } from '../registration';
import type { RegisterFormData, RegisterFormUI } from '../types';
import { isAdmin } from '../types';

// ─── Page aside (Figma Registration/Login v3) ────────────────────────────────

/** The brand panel beside the form on wide screens. It states only what the service really offers. */
function AuthAside({ heading, accent }: { heading: string; accent: string }) {
  return (
    <aside className="auth-aside" aria-label="About Scooter Rent Kandy">
      <div className="auth-aside__art" aria-hidden>
        <ScooterIllustration />
      </div>
      <p className="auth-aside__title">
        {heading} <span className="accent-text">{accent}</span>
      </p>
      <p className="auth-aside__text">
        Book online, sign the rental agreement digitally and pay securely by card. Pay by the hour and kilometre.
      </p>
      <ul className="auth-aside__facts">
        <li>Card payments by Stripe</li>
        <li>GPS-tracked rentals</li>
        <li>Pick-up in Kandy town</li>
      </ul>
    </aside>
  );
}

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
    case 429:
      // SDS 6.1: too many failed sign-ins from this address; the backend says when to try again.
      return err.message || 'Too many failed sign-in attempts. Please wait a minute and try again.';
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
    <div className="auth-container auth-split">
      <AuthAside heading="Welcome back to" accent="Kandy's hills." />
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo"><BrandMark /></div>
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
            <Link to="/forgot-password" className="auth-forgot" id="link-forgot-password">
              Forgot password?
            </Link>
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
  consent:          false,
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
 *   • NIC is required, in a Sri Lankan format (9 digits + V/X, or 12 digits), separate from the passport field
 *   • Consent to store the personal data is required (SDS 8.5)
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

  const setConsent = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, consent: e.target.checked }));

  // The rule for each field, whether or not it has been touched yet.
  const validate = (k: FormKey): string => {
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
        return nicError(form.nicNumber);
      case 'consent':
        return consentError(form.consent);
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

  // Messages are shown only after blur or a submit attempt.
  const fieldError = (k: FormKey): string => (touched[k] ? validate(k) : '');

  const REQUIRED_FIELDS: FormKey[] = [
    'fullName', 'email', 'phone', 'nicNumber', 'password', 'confirmPassword', 'consent',
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    // Touch all required fields to show validation messages
    const allTouched = REQUIRED_FIELDS.reduce(
      (acc, k) => ({ ...acc, [k]: true }),
      {} as Record<FormKey, boolean>,
    );
    setTouched(allTouched);

    // Guard: all required fields must be valid (checked directly: the touched state above applies on the next render)
    const hasError = REQUIRED_FIELDS.some((k) => validate(k) !== '');
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
    <div className="auth-container auth-split auth-split--wide">
      <AuthAside heading="Ride Kandy on" accent="two wheels." />
      <div className="auth-card auth-card--wide">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo"><BrandMark /></div>
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
                placeholder="e.g. 199012345678 or 901234567V"
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

          {/* Consent (SDS 8.5) */}
          <div className="register-consent">
            <label className="inline" htmlFor="reg-consent">
              <input
                id="reg-consent"
                type="checkbox"
                checked={form.consent}
                onChange={setConsent}
                onBlur={blur('consent')}
                aria-invalid={!!fieldError('consent')}
                aria-describedby={fieldError('consent') ? 'err-consent' : undefined}
                required
              />
              <span>
                I agree that Scooter Rent Kandy may store and use the details on this form, including my NIC number,
                to manage my account and rentals. <span className="required">*</span>
              </span>
            </label>
            {fieldError('consent') && (
              <span id="err-consent" className="field-error" role="alert">
                {fieldError('consent')}
              </span>
            )}
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

// ─── Forgot password ──────────────────────────────────────────────────────────

/**
 * Forgot password page — POST /api/auth/forgot-password (BE-041)
 *
 * The answer is always the same generic message, whether or not the email has an account.
 */
export function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [touched, setTouched] = useState(false);
  const [sent,    setSent]    = useState(false);
  const action = useAction();

  const error = touched ? emailError(email) : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailError(email)) return;
    const ok = await action.run(async () => {
      try {
        await api.post('/auth/forgot-password', { email: email.trim() });
        return true;
      } catch (err) {
        throw new Error(err instanceof ApiError ? forgotFailure(err.status, err.message) : forgotFailure(undefined, undefined));
      }
    });
    if (ok) setSent(true);
  };

  return (
    <div className="auth-container auth-split">
      <AuthAside heading="Back on the road in" accent="a few steps." />
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo"><BrandMark /></div>
          <h1 className="auth-title">Forgot password</h1>
          <p className="auth-subtitle">Enter the email address associated with your account.</p>
        </div>

        {sent ? (
          <div className="auth-form">
            <div className="alert success" role="status" aria-live="polite" id="forgot-password-sent">
              {REQUEST_ACCEPTED}
            </div>
            <p className="muted small">The link in the email works once and expires after 30 minutes.</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate id="forgot-password-form">
            <div className="form-group">
              <label htmlFor="forgot-email">
                Email <span className="required">*</span>
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={!!error}
                className={error ? 'input-error' : ''}
              />
              <FieldError message={error} />
            </div>

            <ErrorAlert error={action.error} />

            <button id="btn-forgot-submit" type="submit" className="btn-primary" disabled={action.busy}>
              {action.busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/login" id="link-forgot-back">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Reset password ───────────────────────────────────────────────────────────

/**
 * Reset password page — POST /api/auth/reset-password (BE-041), opened from the emailed link /reset-password?token=…
 *
 * The token is read once and then removed from the address bar, so it does not stay in the browser history. It is
 * never shown or logged.
 */
export function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => resetTokenFrom(location.search));

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [touched,  setTouched]  = useState({ password: false, confirm: false });
  const [done,     setDone]     = useState(false);
  const [linkProblem, setLinkProblem] = useState<string | null>(token ? null : MISSING_TOKEN);
  const action = useAction();

  useEffect(() => {
    if (location.search) navigate('/reset-password', { replace: true });
  }, [location.search, navigate]);

  const errors = {
    password: touched.password ? newPasswordError(password) : '',
    confirm:  touched.confirm  ? confirmPasswordError(password, confirm) : '',
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!token || newPasswordError(password) || confirmPasswordError(password, confirm)) return;
    const ok = await action.run(async () => {
      try {
        await api.post('/auth/reset-password', { token, newPassword: password });
        return true;
      } catch (err) {
        const failure = err instanceof ApiError ? resetFailure(err.status, err.message) : resetFailure(undefined, undefined);
        if (failure.kind === 'link') {
          setLinkProblem(failure.message);
          return false;
        }
        throw new Error(failure.message);
      }
    });
    if (ok) {
      setDone(true);
      setPassword('');
      setConfirm('');
    }
  };

  return (
    <div className="auth-container auth-split">
      <AuthAside heading="Back on the road in" accent="a few steps." />
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo"><BrandMark /></div>
          <h1 className="auth-title">Reset password</h1>
          {!done && !linkProblem && <p className="auth-subtitle">Choose a new password for your account.</p>}
        </div>

        {done ? (
          <div className="auth-form">
            <div className="alert success" role="status" aria-live="polite" id="reset-password-done">
              {RESET_DONE}
            </div>
            <Link to="/login" className="btn btn-primary" id="link-reset-login">Back to login</Link>
          </div>
        ) : linkProblem ? (
          <div className="auth-form">
            <div className="alert" role="alert" id="reset-password-link-problem">{linkProblem}</div>
            <Link to="/forgot-password" className="btn btn-primary" id="link-reset-request-new">
              Request a new link
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate id="reset-password-form">
            <div className="form-group">
              <label htmlFor="reset-password">
                New password <span className="required">*</span>
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                placeholder="Min 8 characters"
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={!!errors.password}
                className={errors.password ? 'input-error' : ''}
              />
              <FieldError message={errors.password} />
            </div>

            <div className="form-group">
              <label htmlFor="reset-confirm">
                Confirm new password <span className="required">*</span>
              </label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your new password"
                maxLength={72}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                aria-invalid={!!errors.confirm}
                className={errors.confirm ? 'input-error' : ''}
              />
              <FieldError message={errors.confirm} />
            </div>

            <ErrorAlert error={action.error} />

            <button id="btn-reset-submit" type="submit" className="btn-primary" disabled={action.busy}>
              {action.busy ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}

        {!done && (
          <p className="auth-footer">
            <Link to="/login" id="link-reset-back">Back to login</Link>
          </p>
        )}
      </div>
    </div>
  );
}
