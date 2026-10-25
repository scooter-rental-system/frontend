// Run with `npm test` (Node's built-in test runner).
// Regression tests for the UI Phase 1 design system and application shell (issue #22). The stylesheet and the shell
// are checked through their source, like the other suites; colour contrast is computed from the token values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('.', import.meta.url));
const root = join(src, '..');
// Line endings are normalised: a Windows checkout (core.autocrlf) has CRLF files.
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const css = read('styles.css');
const layout = read('components', 'Layout.tsx');
const ui = read('components', 'ui.tsx');

/** Body of the first rule whose selector list is exactly `selector` (at the start of a line). */
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `CSS rule ${selector} exists`);
  return match[1];
};

/** Custom properties declared in a block body, as a name → value map. */
const tokensOf = (body) =>
  Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

const LIGHT = tokensOf(css.match(/:root,\n\[data-theme="light"\] \{([^}]*)\}/)[1]);
const DARK_MEDIA = tokensOf(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/)[1]);
const DARK = tokensOf(css.match(/\n\[data-theme="dark"\] \{([^}]*)\}/)[1]);

// WCAG 2.1 relative luminance and contrast ratio, for #rrggbb colours.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('design tokens', () => {
  const ROLES = [
    '--bg', '--surface', '--surface-2', '--border', '--text', '--text-muted',
    '--brand', '--brand-strong', '--on-brand', '--ink', '--on-ink',
    '--success', '--success-soft', '--success-text',
    '--warning', '--warning-soft', '--warning-text',
    '--danger', '--danger-soft', '--danger-text',
    '--info', '--info-soft', '--info-text',
    '--focus',
  ];

  it('defines every colour role in Light and Dark', () => {
    for (const role of ROLES) {
      assert.ok(LIGHT[role], `light ${role}`);
      assert.ok(DARK[role], `dark ${role}`);
    }
  });

  it('defines the same Light and Dark token names, and keeps the two dark blocks identical', () => {
    assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
    assert.deepEqual(DARK_MEDIA, DARK);
  });

  it('uses the SDS brand gold as the light-theme fill colour', () => {
    assert.equal(LIGHT['--brand'], '#b8860b');
  });

  it('meets WCAG AA text contrast (4.5:1) for every text/background pairing, in both themes', () => {
    const pairs = [
      ['--text', '--bg'], ['--text', '--surface'], ['--text', '--surface-2'],
      ['--text-muted', '--bg'], ['--text-muted', '--surface'], ['--text-muted', '--surface-2'],
      ['--on-brand', '--brand'], ['--on-brand', '--brand-hover'],
      ['--brand-strong', '--surface'], ['--brand-strong', '--bg'],
      ['--on-ink', '--ink'], ['--ink-muted', '--ink'], ['--on-ink', '--hero-bg'], ['--ink-muted', '--hero-bg'],
      ['--text', '--brand-soft'],
      ['--success-text', '--success-soft'], ['--warning-text', '--warning-soft'],
      ['--danger-text', '--danger-soft'], ['--info-text', '--info-soft'],
      ['--danger-text', '--surface'],
    ];
    for (const [name, theme] of [['light', LIGHT], ['dark', DARK]]) {
      for (const [fg, bg] of pairs) {
        const ratio = contrast(theme[fg], theme[bg]);
        assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  it('never uses the light-theme gold as text on a light surface', () => {
    // #b8860b on white is ~3.3:1: fine as a fill or focus ring, not as text.
    assert.ok(contrast(LIGHT['--brand'], LIGHT['--surface']) < 4.5);
    assert.doesNotMatch(rule('a'), /var\(--brand\)/);
    assert.match(rule('a'), /color:\s*var\(--brand-strong\)/);
  });

  it('keeps focus rings at 3:1 or better against the page (WCAG non-text contrast)', () => {
    for (const theme of [LIGHT, DARK]) {
      assert.ok(contrast(theme['--focus'], theme['--bg']) >= 3);
      assert.ok(contrast(theme['--brand'], theme['--surface']) >= 3);
    }
  });
});

describe('layout and component classes', () => {
  // These were used by the pages but had no CSS before Phase 1.
  const REQUIRED = [
    '.row', '.stack', '.grid', '.grid-2', '.hero', '.price', '.steps', '.step', '.contract',
    '.scooter-card', '.scooter-thumb', '.between',
  ];

  it('defines every layout class the pages use', () => {
    for (const cls of REQUIRED) assert.ok(rule(cls), cls);
    assert.match(css, /label\.inline/);
    assert.match(css, /button\.primary, \.btn\.primary/);
    assert.match(css, /button\.danger, \.btn\.danger/);
  });

  it('lays out grids responsively, without fixed widths that overflow a phone', () => {
    assert.match(rule('.grid'), /grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /@media \(min-width: 640px\) \{\s*\.grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(css, /@media \(min-width: 1024px\) \{\s*\.grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
    assert.match(rule('.grid-2'), /grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /@media \(min-width: 900px\) \{\s*\.grid-2 \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(rule('.between'), /justify-content:\s*space-between/);
  });

  it('styles primary actions as a gold fill with dark text, and danger as red', () => {
    const primary = css.match(/button\.primary, \.btn\.primary, \.btn-primary \{([^}]*)\}/)[1];
    assert.match(primary, /background:\s*var\(--brand\)/);
    assert.match(primary, /color:\s*var\(--on-brand\)/);
    const danger = css.match(/button\.danger, \.btn\.danger \{([^}]*)\}/)[1];
    assert.match(danger, /border-color:\s*var\(--danger\)/);
    assert.match(danger, /color:\s*var\(--danger-text\)/);
  });

  it('keeps checkboxes and radios at their own size, beside their text', () => {
    const box = css.match(/input\[type="checkbox"\],\ninput\[type="radio"\] \{([^}]*)\}/)[1];
    assert.match(box, /width:\s*1\.125rem/);
    assert.doesNotMatch(box, /width:\s*100%/);
    const inline = css.match(/label\.inline,\nlabel:has\(> input\[type="checkbox"\]\),\nlabel:has\(> input\[type="radio"\]\) \{([^}]*)\}/)[1];
    assert.match(inline, /flex-direction:\s*row/);
  });

  it('bounds the rental agreement in a scrollable box', () => {
    const contract = rule('.contract');
    assert.match(contract, /max-height:/);
    assert.match(contract, /overflow-y:\s*auto/);
  });

  it('marks finished and current steps with more than colour', () => {
    assert.match(css, /\.step\.done::before \{ content: '✓'; \}/);
    assert.match(css, /\.step\.current \{[^}]*font-weight:\s*700/);
  });

  it('has one definition each of .badge, .stat and .form-grid (no silent overrides)', () => {
    for (const selector of ['.badge', '.stat', '.form-grid']) {
      const count = css.split('\n').filter((line) => line === `${selector} {`).length;
      assert.equal(count, 1, selector);
    }
  });

  it('keeps the PR #21 map height', () => {
    assert.match(rule('.map'), /height:\s*clamp\(280px, 55vh, 520px\)/);
  });

  it('loads no web fonts and honours reduced motion', () => {
    assert.doesNotMatch(css, /@import|fonts\.googleapis/);
    assert.match(css, /--font: system-ui/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('application shell', () => {
  it('has a skip link to the main landmark', () => {
    assert.match(layout, /<a className="skip-link" href="#main">\s*Skip to main content\s*<\/a>/);
    assert.match(layout, /<main id="main" className="container" tabIndex=\{-1\}>/);
    assert.ok(layout.indexOf('skip-link') < layout.indexOf('<header'), 'skip link comes first');
    assert.match(layout, /<footer className="site-footer">/);
  });

  it('labels the main, footer and admin navigation landmarks', () => {
    assert.match(layout, /<nav className="nav" aria-label="Main">/);
    assert.match(layout, /<nav aria-label="Footer">/);
    assert.match(layout, /<nav className="sidebar" aria-label="Admin sections">/);
  });

  it('collapses navigation behind an accessible menu button on small screens', () => {
    assert.match(layout, /className="menu-toggle"/);
    assert.match(layout, /aria-expanded=\{menu\.open\}/);
    assert.match(layout, /aria-controls="site-menu"/);
    assert.match(layout, /aria-label="Menu"/);
    assert.match(layout, /<div id="site-menu" className=\{`site-menu\$\{menu\.open \? ' is-open' : ''\}`\}>/);
    // Escape closes it and returns focus to the button; navigating closes it.
    assert.match(layout, /e\.key === 'Escape'\) \{\s*setOpen\(false\);\s*buttonRef\.current\?\.focus\(\);/);
    assert.match(layout, /useEffect\(\(\) => setOpen\(false\), \[location\.pathname\]\)/);
    // Hidden below 900px unless open; never a wrapped row of links.
    assert.match(css, /@media \(max-width: 899px\) \{[\s\S]*?\.site-menu \{\s*display: none;[\s\S]*?\.site-menu\.is-open \{ display: flex; \}/);
    assert.match(css, /\.menu-toggle \{ display: none;/);
  });

  it('keeps navigation role-gated: customer pages for customers, Admin for admins', () => {
    assert.match(layout, /const customer = user\?\.role === 'USER'/);
    assert.match(layout, /\{customer && <NavLink to="\/dashboard">Dashboard<\/NavLink>\}/);
    assert.match(layout, /\{customer && <NavLink to="\/bookings">My Bookings<\/NavLink>\}/);
    assert.match(layout, /\{isAdmin\(user\?\.role\) && <NavLink to="\/admin">Admin<\/NavLink>\}/);
    assert.match(layout, /\{user && <NotificationBell \/>\}/);
    assert.match(layout, /<SiteFooter customer=\{customer\} admin=\{isAdmin\(user\?\.role\)\} signedIn=\{!!user\} \/>/);
    const footer = layout.slice(layout.indexOf('function SiteFooter'));
    assert.match(footer, /\{customer && \(\s*<li>\s*<Link to="\/bookings">My Bookings<\/Link>/);
    assert.match(footer, /\{customer && \(\s*<li>\s*<Link to="\/profile">Profile<\/Link>/);
    assert.match(footer, /\{admin && \(\s*<li>\s*<Link to="\/admin">Admin<\/Link>/);
    assert.match(footer, /\{!signedIn && \(\s*<li>\s*<Link to="\/login">Log in<\/Link>/);
  });

  it('keeps the logout and sign-in controls', () => {
    assert.match(layout, /id="btn-logout"\s*onClick=\{\(\) => \{\s*logout\(\);\s*navigate\('\/'\);/);
    assert.match(layout, /<Link to="\/login" className="btn small on-ink" id="link-login">/);
    assert.match(layout, /<Link to="\/register" className="btn small primary" id="link-register">/);
  });

  it('uses the project logo and scooter artwork instead of emoji', () => {
    for (const source of [layout, ui, read('pages', 'Auth.tsx')]) assert.doesNotMatch(source, /🛵/);
    assert.match(ui, /export function BrandMark\(\)/);
    assert.match(ui, /export function ScooterIllustration\(\)/);
    assert.match(ui, /imageUrl \? <img src=\{imageUrl\} alt=\{alt\} \/> : <ScooterIllustration \/>/);
    const favicon = readFileSync(join(root, 'public', 'scooter.svg'), 'utf8');
    assert.match(favicon, /fill="#b8860b"/);
  });

  it('names the business consistently', () => {
    assert.match(layout, /const BRAND_NAME = 'Scooter Rent Kandy';/);
    assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /<title>Scooter Rent Kandy<\/title>/);
  });
});
