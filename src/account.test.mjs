// Run with `npm test` (Node's built-in test runner).
// Change password (customers and admins), the admin profile and the Back control. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN_NAV } from './admin.ts';
import { passwordChangeProblem } from './account.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('password change rules', () => {
  it('accepts a valid change', () => {
    assert.equal(passwordChangeProblem('old-pass-1', 'new-pass-22', 'new-pass-22'), null);
  });

  it('requires the current password, 8-72 characters, a different password and a matching confirmation', () => {
    assert.match(passwordChangeProblem('', 'new-pass-22', 'new-pass-22'), /current password/);
    assert.match(passwordChangeProblem('old-pass-1', 'short7!', 'short7!'), /8 to 72/);
    assert.match(passwordChangeProblem('old-pass-1', 'p'.repeat(73), 'p'.repeat(73)), /8 to 72/);
    assert.match(passwordChangeProblem('same-pass-1', 'same-pass-1', 'same-pass-1'), /different/);
    assert.match(passwordChangeProblem('old-pass-1', 'new-pass-22', 'new-pass-23'), /do not match/);
  });
});

describe('change password form', () => {
  const form = read('components', 'ChangePasswordForm.tsx');

  it('sends only the current and new password to PUT /api/me/password', () => {
    assert.match(form, /api\.put<void>\('\/me\/password', \{ currentPassword: current, newPassword: next \}\)/);
    assert.doesNotMatch(form, /confirmPassword|newPasswordConfirm/);
  });

  it('treats the 204 response as success explicitly and then closes the dialog', () => {
    assert.match(form, /\.then\(\(\) => true\)/);
    assert.match(form, /if \(ok\) onChanged\(\);/);
    assert.match(form, /onChanged=\{\(\) => \{\s*setOpen\(false\);\s*setChanged\(true\);/);
  });

  it('shows only a button on the profile and opens an accessible modal dialog', () => {
    assert.match(form, /className="btn-change-password"/);
    assert.match(form, /\{open && \(\s*<ChangePasswordDialog/);
    assert.match(form, /<dialog\s+ref=\{ref\}/);
    assert.match(form, /dialog\.showModal\(\)/);
    assert.match(form, /aria-labelledby=\{ids\.title\}/);
    assert.match(form, /trigger\?\.focus\(\);/);
  });

  it('closes on Escape or Cancel, but not while the change is being sent', () => {
    assert.match(form, /onCancel=\{\(e\) => \{[^}]*e\.preventDefault\(\);\s*if \(!action\.busy\) onClose\(\);/);
    assert.match(form, /<button type="button" onClick=\{onClose\} disabled=\{action\.busy\}>\s*Cancel/);
  });

  it('has labelled password fields with the right autocomplete hints and status messages', () => {
    for (const text of ['Current password', 'New password', 'Confirm new password']) assert.ok(form.includes(text), text);
    assert.match(form, /autoComplete="current-password"/);
    assert.equal((form.match(/autoComplete="new-password"/g) ?? []).length, 2);
    assert.match(form, /<div className="alert success" role="status">/);
    assert.match(form, /\{action\.busy \? 'Changing…' : 'Change password'\}/);
  });

  it('is on the customer profile and the admin profile', () => {
    assert.match(read('pages', 'Profile.tsx'), /<ChangePasswordForm \/>/);
    assert.match(read('pages', 'admin', 'Profile.tsx'), /<ChangePasswordForm \/>/);
  });
});

describe('admin profile', () => {
  it('is an admin route with a sidebar link', () => {
    assert.match(read('App.tsx'), /<Route path="profile" element=\{<AdminProfile \/>\} \/>/);
    const links = ADMIN_NAV.flatMap((g) => g.links);
    assert.ok(links.some((l) => l.to === '/admin/profile' && l.icon === 'profile'));
  });

  it('shows only fields the backend returns for /api/me', () => {
    const page = read('pages', 'admin', 'Profile.tsx');
    for (const field of ['user.fullName', 'user.email', 'user.role']) assert.ok(page.includes(field), field);
    assert.doesNotMatch(page, /avatar|photo|department|title:/i);
  });
});

describe('back control', () => {
  const back = read('components', 'BackLink.tsx');

  it('goes back in the app history when there is one, otherwise to a safe fallback link', () => {
    assert.match(back, /\(window\.history\.state as \{ idx\?: number \} \| null\)\?\.idx \?\? 0/);
    assert.match(back, /if \(idx > 0\) \{\s*e\.preventDefault\(\);\s*navigate\(-1\);/);
    assert.match(back, /<Link to=\{fallback\} className="back-link"/);
  });

  it('is on the detail and workflow pages', () => {
    assert.match(read('pages', 'BookingDetail.tsx'), /<BackLink fallback=\{inAdmin \? '\/admin\/bookings' : '\/bookings'\}/);
    assert.match(read('pages', 'Checkout.tsx'), /<BackLink fallback=\{bookingPath\(b\.id\)\}/);
    assert.match(read('pages', 'Profile.tsx'), /<BackLink fallback="\/dashboard" \/>/);
    assert.match(read('pages', 'admin', 'Profile.tsx'), /<BackLink fallback="\/admin" \/>/);
  });
});
