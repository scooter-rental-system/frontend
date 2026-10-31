// Run with `npm test` (Node's built-in test runner).
// Regression tests for UI Phase 6, the final Figma alignment and polish (issue #32). Source is read the same way as
// the other suites (CRLF-safe); there are no pixel or giant stylesheet assertions.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const production = files(src).filter((f) => /\.(ts|tsx)$/.test(f));

const dialog = read('components', 'ConfirmDialog.tsx');
const hook = read('useConfirm.tsx');
const css = read('styles.css');

describe('accessible confirmation dialog', () => {
  it('is a labelled, described native modal dialog', () => {
    assert.match(dialog, /<dialog\s/);
    assert.match(dialog, /dialog\.showModal\(\)/);
    assert.match(dialog, /aria-labelledby=\{titleId\}/);
    assert.match(dialog, /aria-describedby=\{messageId\}/);
    assert.match(dialog, /<h2 id=\{titleId\}/);
  });

  it('starts on Cancel, cancels on Escape and returns focus to the trigger', () => {
    assert.match(dialog, /<button type="button" autoFocus onClick=\{\(\) => answer\(false\)\}>/);
    assert.match(dialog, /onCancel=\{\(e\) => \{[^}]*e\.preventDefault\(\);\s*answer\(false\);/);
    assert.match(dialog, /const trigger = document\.activeElement instanceof HTMLElement \? document\.activeElement : null;/);
    assert.match(dialog, /trigger\?\.focus\(\);/);
  });

  it('answers once, so a double click cannot run the action twice', () => {
    assert.match(dialog, /if \(answered\.current\) return;\s*answered\.current = true;/);
  });

  it('marks destructive confirmations with the danger button and others with the primary one', () => {
    assert.match(dialog, /className=\{destructive \? 'danger' : 'primary'\}/);
  });

  it('resolves the caller\'s promise with the answer and closes', () => {
    assert.match(hook, /new Promise<boolean>\(\(resolve\) => setRequest\(\{ \.\.\.options, resolve \}\)\)/);
    assert.match(hook, /request\?\.resolve\(ok\);\s*setRequest\(null\);/);
  });

  it('replaces every window.confirm in the application', () => {
    for (const file of production) {
      if (file.endsWith('ConfirmDialog.tsx') || file.endsWith('useConfirm.tsx')) continue;
      assert.doesNotMatch(readFileSync(file, 'utf8'), /window\.confirm\(/, file);
    }
    for (const page of [['pages', 'BookingDetail.tsx'], ['pages', 'admin', 'Bookings.tsx'], ['pages', 'admin', 'Fleet.tsx'], ['pages', 'admin', 'People.tsx']]) {
      const text = read(...page);
      assert.match(text, /const \{ confirm, dialog \} = useConfirm\(\);/, page.join('/'));
      assert.match(text, /\{dialog\}/, page.join('/'));
    }
  });

  it('keeps the booking actions behind the same conditions and API calls', () => {
    const detail = read('pages', 'BookingDetail.tsx');
    assert.match(detail, /b\.stage === 'UPCOMING' \|\|\s*canCancelPickup\(b, adminView\);/);
    // A viva demo rental (no payment record) is ended only by the admin demo controls.
    assert.match(detail, /const demoRental = isDemoRental\(b\);/);
    assert.match(detail, /const canReturn = b\.stage === 'IN_PROGRESS' && adminView && !demoRental;/);
    assert.match(detail, /api\.post<Booking>\(`\$\{bookingApi\}\/cancel`\)/);
    // A frozen bill is retried as it is, with no odometer reading.
    assert.match(detail, /await end\.run\(\(\) => api\.put<Booking>\(completePath\(b\.id\), \{\}\)\);/);
  });

  it('is styled as a bounded modal with a visible backdrop', () => {
    assert.match(css, /\.confirm-dialog::backdrop \{/);
    assert.match(css, /\.confirm-dialog \{[^}]*width: min\(460px, calc\(100vw - 32px\)\);/);
  });
});

describe('loading, empty and error states', () => {
  const ui = read('components', 'ui.tsx');
  const card = read('components', 'BookingCard.tsx');

  it('announces loading politely with a skeleton bar', () => {
    assert.match(ui, /<div className="loading-state" role="status">/);
    assert.match(ui, /<span className="loading-state__bar skeleton" aria-hidden \/>/);
  });

  it('shows booking skeletons hidden from screen readers, with one spoken status', () => {
    assert.match(card, /export function BookingListSkeleton/);
    assert.match(card, /<p className="sr-only" role="status">/);
    assert.match(card, /<ul className="booking-list" aria-hidden>/);
    for (const page of ['Dashboard.tsx', 'MyBookings.tsx']) {
      const text = read('pages', page);
      assert.match(text, /\{loading && !data && <BookingListSkeleton label="Loading your bookings" \/>\}/, page);
      assert.match(text, /<LoadError error=\{`We couldn't load your bookings\. \$\{error\}`\} onRetry=\{reload\} \/>/, page);
    }
  });
});

describe('Figma-aligned public pages', () => {
  it('keeps the Home discovery (search, sort, available-only, URL state) under the new hero', () => {
    const home = read('pages', 'Home.tsx');
    assert.match(home, /<h1 id="home-title">[\s\S]*<span className="accent-text">on two wheels<\/span>/);
    assert.match(home, /role="search"/);
    assert.match(home, /setParams\(discoveryParams/);
    assert.match(home, /checked=\{discovery\.available\}/);
    assert.doesNotMatch(home, /rating|review|testimonial|\d+k\+|happy riders/i);
  });

  it('puts the availability pill over the scooter photo, still as text', () => {
    const card = read('components', 'ScooterCard.tsx');
    assert.match(card, /<div className="scooter-card__media">\s*<ScooterThumb[^>]*\/>\s*<span className=\{`badge \$\{availability\.tone\}`\}>\{availability\.label\}<\/span>/);
  });

  it('gives Login, Register, Forgot password and Reset password the brand panel without unsupported sign-in options', () => {
    const auth = read('pages', 'Auth.tsx');
    assert.equal((auth.match(/<AuthAside /g) ?? []).length, 4);
    assert.match(auth, /<aside className="auth-aside" aria-label="About Scooter Rent Kandy">/);
    assert.doesNotMatch(auth, /google|two-factor|\botp\b/i);
    assert.match(auth, /<form className="auth-form" onSubmit=\{submit\} noValidate id="login-form">/);
    assert.match(auth, /<form className="auth-form" onSubmit=\{submit\} noValidate id="register-form">/);
  });

  it('draws the brand mark from theme tokens rather than a fixed colour', () => {
    const ui = read('components', 'ui.tsx');
    const mark = ui.slice(ui.indexOf('export function BrandMark'), ui.indexOf('export function ScooterIllustration'));
    assert.match(mark, /className="brand-mark__tile"/);
    assert.doesNotMatch(mark, /fill="#/);
    assert.match(css, /\.brand-mark__tile\s+\{ fill: var\(--ink-accent\); \}/);
  });
});

describe('customer pages keep their behaviour', () => {
  it('lays out checkout around the real Stripe Payment Element only', () => {
    const checkout = read('pages', 'Checkout.tsx');
    assert.match(checkout, /<StripePayment\s+bookingId=\{b\.id\}\s+purpose="initial"/);
    assert.match(checkout, /createIntent=\{\(\) => api\.post<PaymentIntent>\(`\/bookings\/\$\{b\.id\}\/payment-intent`\)\}/);
    assert.match(checkout, /<ul className="checkout-trust" aria-label="About this payment">/);
    assert.doesNotMatch(checkout, /4242|cc-number|cardNumber|type="tel"/);
  });

  it('keeps the agreement signing (checkbox, typed name, sign API)', () => {
    const checkout = read('pages', 'Checkout.tsx');
    assert.match(checkout, /api\.post<Contract>\(`\$\{bookingApi\}\/contract\/sign`, \{ signedName, agree \}\)/);
    assert.match(checkout, /disabled=\{!agree \|\| !signedName \|\| sign\.busy\}/);
    assert.doesNotMatch(checkout, /<canvas/);
  });

  it('keeps the dashboard sections and invents no wallet or loyalty figures', () => {
    const dashboard = read('pages', 'Dashboard.tsx');
    for (const id of ['right-now-title', 'attention-title', 'upcoming-title', 'history-title', 'account-title']) {
      assert.match(dashboard, new RegExp(`id="${id}"`), id);
    }
    assert.doesNotMatch(dashboard, /wallet|loyalty|voucher|points|tier/i);
  });

  it('keeps the booking form, quote and gear quantities on the booking page', () => {
    const book = read('pages', 'ScooterBook.tsx');
    assert.match(book, /api\s*\.post<Quote>\('\/bookings\/quote', \{ scooterId: id, gear: selection \}\)/);
    assert.match(book, /<QuantityStepper/);
    assert.match(book, /const canReserve = !!quote && startValid && s\.available && !create\.busy;/);
  });
});

describe('theme and accessibility guards', () => {
  it('keeps a visible boundary on admin form fields (WCAG 1.4.11)', () => {
    const rule = css.match(/\.admin-form label:not\(\.inline\) :is\(input, select, textarea\) \{([^}]*)\}/)[1];
    assert.doesNotMatch(rule, /border-color:\s*transparent/);
  });

  it('marks the current public page with the accent underline (not colour alone)', () => {
    assert.match(css, /\.nav a\.active \{ box-shadow: inset 0 -2px 0 var\(--ink-accent\);/);
  });

  it('respects reduced motion for the admin drawer and page transitions', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{/);
  });
});
