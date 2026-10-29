// Run with `npm test` (Node's built-in test runner).
// Forgot password / reset password (backend BE-041): the generic answer (no account enumeration), the token in the
// link, the password rules, error handling, and the pages and routes. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  confirmPasswordError, emailError, forgotFailure, MISSING_TOKEN, newPasswordError, REQUEST_ACCEPTED, RESET_DONE,
  resetFailure, resetTokenFrom,
} from './passwordReset.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const auth = read('pages', 'Auth.tsx');
const app = read('App.tsx');
const css = read('styles.css');

/** The source of one exported page component of Auth.tsx. */
function page(name) {
  const start = auth.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = auth.indexOf('\nexport function ', start + 1);
  return auth.slice(start, next < 0 ? undefined : next);
}

const login = page('Login');
const forgot = page('ForgotPassword');
const reset = page('ResetPassword');
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd';

describe('login page', () => {
  it('links to the forgot password page', () => {
    assert.match(login, /<Link to="\/forgot-password"[^>]*>\s*Forgot password\?\s*<\/Link>/);
    assert.match(css, /\.auth-forgot \{/);
  });
});

describe('routes', () => {
  it('serves both pages publicly, outside RequireAuth', () => {
    assert.match(app, /<Route path="forgot-password" element={<ForgotPassword \/>} \/>/);
    assert.match(app, /<Route path="reset-password" element={<ResetPassword \/>} \/>/);
    assert.doesNotMatch(app, /RequireAuth[^\n]*(ForgotPassword|ResetPassword)/);
  });
});

describe('forgot password page', () => {
  it('has the agreed wording', () => {
    assert.match(forgot, /<h1 className="auth-title">Forgot password<\/h1>/);
    assert.match(forgot, /Enter the email address associated with your account\./);
    assert.match(forgot, /<label htmlFor="forgot-email">\s*Email/);
    assert.match(forgot, /'Send reset link'/);
    assert.match(forgot, /<Link to="\/login"[^>]*>Back to login<\/Link>/);
  });

  it('posts the trimmed email and then always shows the generic answer', () => {
    assert.match(forgot, /api\.post\('\/auth\/forgot-password', \{ email: email\.trim\(\) \}\)/);
    assert.match(forgot, /role="status"[^>]*>\s*\{REQUEST_ACCEPTED\}/);
    assert.equal(REQUEST_ACCEPTED, 'If an account exists for that email, password reset instructions have been sent.');
  });

  it('never says whether an account exists', () => {
    assert.doesNotMatch(auth, /email not found|no account|not registered/i);
    for (const status of [400, 404, 409, 500, 503, undefined]) {
      assert.doesNotMatch(forgotFailure(status, 'User not found'), /not found|exist/i, String(status));
    }
  });

  it('explains the per-device limit', () => {
    assert.match(forgotFailure(429, 'Too many password reset requests from this device. Please try again in 15 minutes.'),
      /Too many password reset requests/);
    assert.match(forgotFailure(429, ''), /15 minutes/);
  });

  it('checks the email before sending', () => {
    assert.equal(emailError(''), 'Email is required');
    assert.equal(emailError('not-an-email'), 'Enter a valid email address');
    assert.equal(emailError(' rider@example.com '), '');
    assert.match(forgot, /type="email"/);
    assert.match(forgot, /autoComplete="email"/);
  });
});

describe('reset link token', () => {
  it('reads a well-formed token from the query string', () => {
    assert.equal(resetTokenFrom(`?token=${TOKEN}`), TOKEN);
  });

  it('treats a missing, empty or malformed token as missing', () => {
    for (const search of ['', '?', '?token=', '?token=short', '?other=1', '?token=has%20space%20inside%20it%20xx',
      '?token=<script>alert(1)</script>aaaaaaaaaa']) {
      assert.equal(resetTokenFrom(search), null, search);
    }
  });

  it('is removed from the address bar and never shown or logged', () => {
    assert.match(reset, /useState\(\(\) => resetTokenFrom\(location\.search\)\)/);
    assert.match(reset, /navigate\('\/reset-password', \{ replace: true \}\)/);
    assert.doesNotMatch(reset, /console\./);
    assert.doesNotMatch(reset, /\{token\}/);
  });
});

describe('reset password page', () => {
  it('has the agreed wording', () => {
    assert.match(reset, /<h1 className="auth-title">Reset password<\/h1>/);
    assert.match(reset, /<label htmlFor="reset-password">\s*New password/);
    assert.match(reset, /<label htmlFor="reset-confirm">\s*Confirm new password/);
    assert.match(reset, /'Reset password'\}/);
  });

  it('checks the password rule and the confirmation before sending', () => {
    assert.equal(newPasswordError(''), 'New password is required');
    assert.match(newPasswordError('short'), /at least 8/);
    assert.match(newPasswordError('x'.repeat(73)), /72 characters or fewer/);
    assert.equal(newPasswordError('long-enough-1'), '');
    assert.equal(confirmPasswordError('long-enough-1', ''), 'Please confirm your new password');
    assert.equal(confirmPasswordError('long-enough-1', 'long-enough-2'), 'Passwords do not match');
    assert.equal(confirmPasswordError('long-enough-1', 'long-enough-1'), '');
    assert.match(reset, /if \(!token \|\| newPasswordError\(password\) \|\| confirmPasswordError\(password, confirm\)\) return;/);
    assert.match(reset, /autoComplete="new-password"/);
    assert.match(reset, /maxLength=\{72\}/);
  });

  it('sends the token and the new password only', () => {
    assert.match(reset, /api\.post\('\/auth\/reset-password', \{ token, newPassword: password \}\)/);
  });

  it('shows a missing token without the form, with a way to request a new link', () => {
    assert.match(reset, /useState<string \| null>\(token \? null : MISSING_TOKEN\)/);
    assert.match(reset, /<Link to="\/forgot-password"[^>]*>\s*Request a new link/);
    assert.match(MISSING_TOKEN, /request a new one/i);
  });

  it('maps invalid, expired and used links to the link problem view', () => {
    for (const message of [
      'This password reset link is not valid. Please request a new one.',
      'This password reset link has expired. Please request a new one.',
      'This password reset link has already been used or replaced by a newer one. Please request a new one.',
    ]) {
      assert.deepEqual(resetFailure(400, message), { kind: 'link', message });
    }
    assert.equal(resetFailure(400, 'Validation failed: token must not be blank').kind, 'link');
  });

  it('keeps the form for a weak password and other errors', () => {
    assert.deepEqual(resetFailure(400, 'Validation failed: newPassword must be between 8 and 72 characters'),
      { kind: 'password', message: 'Password must be between 8 and 72 characters.' });
    assert.equal(resetFailure(500, 'boom').kind, 'other');
    assert.doesNotMatch(resetFailure(500, 'java.lang.NullPointerException').message, /java/);
    assert.equal(resetFailure(undefined, undefined).kind, 'other');
  });

  it('confirms success and leads back to login', () => {
    assert.equal(RESET_DONE, 'Your password has been reset successfully.');
    assert.match(reset, /role="status"[^>]*>\s*\{RESET_DONE\}/);
    assert.match(reset, /<Link to="\/login"[^>]*>Back to login<\/Link>/);
  });
});

describe('accessibility and layout', () => {
  it('labels every field, marks invalid ones and announces messages', () => {
    for (const source of [forgot, reset]) {
      const ids = [...source.matchAll(/<input\s+id="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(ids.length > 0);
      for (const id of ids) assert.match(source, new RegExp(`htmlFor="${id}"`), id);
      assert.match(source, /aria-invalid=/);
      assert.match(source, /<ErrorAlert error=\{action\.error\} \/>/);
    }
    assert.match(reset, /role="alert"/);
  });

  it('uses the shared auth layout and theme tokens (responsive, light and dark)', () => {
    for (const source of [forgot, reset]) {
      assert.match(source, /className="auth-container auth-split"/);
      assert.match(source, /className="auth-card"/);
      assert.doesNotMatch(source, /style=\{\{/);
    }
    assert.doesNotMatch(css.slice(css.indexOf('.auth-forgot')), /^\.auth-forgot[^\n]*#[0-9a-f]{3,6}/im);
  });
});
