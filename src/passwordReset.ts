/**
 * Forgot password / reset password rules shared with the backend (BE-041). Kept free of runtime imports so
 * `npm test` can run them.
 */

/** The only answer to a reset request, whether or not the email has an account (no account enumeration). */
export const REQUEST_ACCEPTED = 'If an account exists for that email, password reset instructions have been sent.';

export const RESET_DONE = 'Your password has been reset successfully.';

/** Shown when the page is opened without a usable token in the link. */
export const MISSING_TOKEN =
  'This password reset link is incomplete or not valid. Please request a new one from the Forgot password page.';

/** The backend's tokens are 43 URL-safe Base64 characters; anything clearly different is not worth sending. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;

/** The token from the page's query string (`?token=...`), or null when it is missing or malformed. */
export function resetTokenFrom(search: string): string | null {
  const token = new URLSearchParams(search).get('token')?.trim() ?? '';
  return TOKEN_SHAPE.test(token) ? token : null;
}

/** The new password's message, or '' when valid: the registration rule, 8 to 72 characters. */
export function newPasswordError(password: string): string {
  if (!password) return 'New password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 72) return 'Password must be 72 characters or fewer';
  return '';
}

/** The confirmation's message, or '' when it matches. */
export function confirmPasswordError(password: string, confirm: string): string {
  if (!confirm) return 'Please confirm your new password';
  if (confirm !== password) return 'Passwords do not match';
  return '';
}

/** A simple shape check before sending; the backend validates the address properly. */
export function emailError(email: string): string {
  const value = email.trim();
  if (!value) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
  return '';
}

/**
 * What went wrong with a reset, from the API error's status and message. `link` means the link itself is unusable
 * (not valid, expired or already used): the page then offers a new request instead of the form.
 */
export type ResetFailure = { kind: 'link' | 'password' | 'other'; message: string };

export function resetFailure(status: number | undefined, message: string | undefined): ResetFailure {
  const text = message ?? '';
  if (status === 400 && /reset link/i.test(text)) return { kind: 'link', message: text };
  if (status === 400 && /newPassword/i.test(text)) {
    return { kind: 'password', message: 'Password must be between 8 and 72 characters.' };
  }
  if (status === 400) return { kind: 'link', message: MISSING_TOKEN };
  if (status === 429) return { kind: 'other', message: text || 'Too many requests. Please try again later.' };
  return { kind: 'other', message: 'Could not reset your password right now. Please try again in a moment.' };
}

/** The message for a failed reset request; never says whether the email has an account. */
export function forgotFailure(status: number | undefined, message: string | undefined): string {
  if (status === 429) return message || 'Too many password reset requests. Please try again in 15 minutes.';
  if (status === 400) return 'Enter a valid email address.';
  return 'Could not send the request right now. Please try again in a moment.';
}
