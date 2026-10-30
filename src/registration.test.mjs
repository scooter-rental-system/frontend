// Run with `npm test` (Node's built-in test runner).
// Registration rules shared with the backend (issue #34, backend BE-035): Sri Lankan NIC format (SDS 6.3), explicit
// consent (SDS 8.5), and the login rate-limit message (SDS 6.1). Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { consentError, NIC_PATTERN, nicError } from './registration.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const auth = read('pages', 'Auth.tsx');

describe('Sri Lankan NIC format', () => {
  it('accepts the old (9 digits + V/X) and new (12 digits) formats, trimming spaces', () => {
    for (const nic of ['912345678V', '912345678v', '912345678X', '912345678x', '199112345678', ' 199112345678 ']) {
      assert.equal(nicError(nic), '', nic);
    }
  });

  it('rejects everything else with a message that states the format', () => {
    for (const nic of ['T1', '12345678V', '1234567890V', '123456789', '12345678901', '1234567890123', '123456789A',
      'V123456789', '1991 12345678', '200012345678V']) {
      assert.match(nicError(nic), /9 digits followed by V or X, or 12 digits/, nic);
    }
    assert.equal(nicError('   '), 'NIC number is required');
  });

  it('uses the same rule as the backend (UserDtos.SRI_LANKAN_NIC)', () => {
    assert.equal(NIC_PATTERN.source, '^(\\d{9}[VvXx]|\\d{12})$');
  });
});

describe('registration consent', () => {
  it('requires the box to be ticked', () => {
    assert.match(consentError(false), /accept/);
    assert.equal(consentError(true), '');
  });

  it('sends consent with the registration and starts unticked', () => {
    assert.match(read('types.ts'), /consent: boolean;/);
    assert.match(auth, /consent:\s+false,/);
    assert.match(auth, /'nicNumber', 'password', 'confirmPassword', 'consent',/);
  });

  it('is a labelled checkbox with its error tied to it', () => {
    assert.match(auth, /<label className="inline" htmlFor="reg-consent">\s*<input\s+id="reg-consent"\s+type="checkbox"/);
    assert.match(auth, /aria-describedby=\{fieldError\('consent'\) \? 'err-consent' : undefined\}/);
    assert.match(auth, /<span id="err-consent" className="field-error" role="alert">/);
  });

  it('validates every required field on submit, not only the ones already touched', () => {
    assert.match(auth, /const hasError = REQUIRED_FIELDS\.some\(\(k\) => validate\(k\) !== ''\);/);
    assert.match(auth, /case 'nicNumber':\s*return nicError\(form\.nicNumber\);/);
  });

  it('collects no new personal fields', () => {
    const form = auth.slice(auth.indexOf('const INITIAL_FORM'), auth.indexOf('type FormKey'));
    const keys = [...form.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    assert.deepEqual(keys, ['fullName', 'email', 'phone', 'nicNumber', 'password', 'confirmPassword', 'country',
      'idDocumentNumber', 'drivingLicenseNo', 'consent']);
  });
});

describe('login rate limit', () => {
  it('shows the backend\'s 429 message (SDS 6.1: 5 failed attempts per minute)', () => {
    assert.match(auth, /case 429:\s*\/\/[^\n]*\n\s*return err\.message \|\| 'Too many failed sign-in attempts/);
  });
});
