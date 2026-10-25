// Run with `npm test` (Node's built-in test runner; type stripping loads themeMode.ts and routes.ts).
// Regression tests for the final-audit frontend fixes (issue #20). Components are checked through their source,
// as the other suites do; the inline theme script in index.html is run against TEST-ONLY browser stand-ins.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { adminBookingPath, bookingPath } from './routes.ts';
import { applyResolvedTheme, DARK_QUERY, parseTheme, resolveTheme, THEME_STORAGE_KEY } from './themeMode.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const root = join(src, '..');
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8');
const app = read('App.tsx');
const css = read('styles.css');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

/** The JSX of one <Route> line in App.tsx, by its path. */
const routeLine = (path) => {
  const line = app.split('\n').find((l) => l.includes(`path="${path}"`));
  assert.ok(line, `route ${path} exists`);
  return line;
};

/** The body of the first CSS rule whose selector list is exactly `selector`. */
const cssRule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `CSS rule ${selector} exists`);
  return match[1];
};

describe('booking routes', () => {
  it('builds the customer and admin booking paths with encoded ids', () => {
    assert.equal(bookingPath('42'), '/bookings/42');
    assert.equal(adminBookingPath('42'), '/admin/bookings/42');
    assert.equal(adminBookingPath('../profile?x=1'), '/admin/bookings/..%2Fprofile%3Fx%3D1');
  });

  it('serves /admin/bookings/:id inside the admin-only route', () => {
    const admin = app.indexOf('<Route path="admin"');
    const adminEnd = app.indexOf('</Route>', admin);
    assert.match(app.slice(admin, app.indexOf('\n', admin)), /<RequireAuth admin>/);
    const detail = app.indexOf('<Route path="bookings/:id"', admin);
    assert.ok(detail > admin && detail < adminEnd, 'bookings/:id is nested under /admin');
    assert.match(app.slice(detail, app.indexOf('\n', detail)), /<BookingDetail \/>/);
  });

  it('keeps the customer booking pages customer-only', () => {
    for (const path of ['bookings/:id', 'bookings/:id/checkout', 'bookings', 'dashboard', 'profile']) {
      assert.match(routeLine(path), /<RequireAuth customer>/, path);
    }
  });

  it('links admin pages to the admin booking view, never the customer-only route', () => {
    for (const page of ['Bookings.tsx', 'Billing.tsx', 'Dashboard.tsx']) {
      const source = read('pages', 'admin', page);
      assert.match(source, /to=\{adminBookingPath\(/, page);
      assert.doesNotMatch(source, /to=\{`\/bookings\//, page);
    }
  });
});

describe('theme', () => {
  const fakeRoot = () => {
    const attrs = {};
    return { attrs, setAttribute: (name, value) => (attrs[name] = value), style: { colorScheme: '' } };
  };

  it('treats an unknown or missing stored theme as System', () => {
    assert.equal(parseTheme('light'), 'light');
    assert.equal(parseTheme('dark'), 'dark');
    assert.equal(parseTheme('system'), 'system');
    assert.equal(parseTheme('purple'), 'system');
    assert.equal(parseTheme(null), 'system');
  });

  it('keeps Light light and Dark dark whatever the device prefers; System follows the device', () => {
    for (const prefersDark of [false, true]) {
      assert.equal(resolveTheme('light', prefersDark), 'light');
      assert.equal(resolveTheme('dark', prefersDark), 'dark');
    }
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });

  it('writes an explicit data-theme for light as well as dark', () => {
    for (const resolved of ['light', 'dark']) {
      const el = fakeRoot();
      applyResolvedTheme(el, resolved);
      assert.equal(el.attrs['data-theme'], resolved);
      assert.equal(el.style.colorScheme, resolved);
    }
  });

  describe('early script in index.html', () => {
    const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];

    /** Runs the inline script with a TEST-ONLY document, localStorage and matchMedia. */
    const runEarly = (stored, prefersDark, { storageThrows = false } = {}) => {
      const el = fakeRoot();
      const queries = [];
      runInNewContext(script, {
        document: { documentElement: el },
        localStorage: {
          getItem(key) {
            if (storageThrows) throw new Error('storage blocked');
            return key === THEME_STORAGE_KEY ? stored : null;
          },
        },
        window: {
          matchMedia(query) {
            queries.push(query);
            return { matches: prefersDark };
          },
        },
      });
      return { el, queries };
    };

    it('runs before the app module and reads only the theme preference', () => {
      assert.ok(script, 'inline theme script exists');
      assert.ok(indexHtml.indexOf('<script>') < indexHtml.indexOf('src="/src/main.tsx"'));
      assert.doesNotMatch(script, /token|auth|user|fetch|cookie/i);
    });

    it('applies the same theme the app resolves, for every preference and device setting', () => {
      for (const stored of ['light', 'dark', 'system', null, 'bogus']) {
        for (const prefersDark of [false, true]) {
          const { el, queries } = runEarly(stored, prefersDark);
          const expected = resolveTheme(parseTheme(stored), prefersDark);
          assert.equal(el.attrs['data-theme'], expected, `${stored} / prefersDark=${prefersDark}`);
          assert.equal(el.style.colorScheme, expected);
          for (const q of queries) assert.equal(q, DARK_QUERY);
        }
      }
    });

    it('falls back to System when storage is unavailable', () => {
      assert.equal(runEarly('light', true, { storageThrows: true }).el.attrs['data-theme'], 'dark');
      assert.equal(runEarly('dark', false, { storageThrows: true }).el.attrs['data-theme'], 'light');
    });
  });

  it('lets an explicit light theme override a dark device preference in CSS', () => {
    assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
    assert.match(css, /\n\[data-theme="light"\] \{/);
    // The old rules: an invalid media query that applied dark colours in Light, and a light selector
    // that only matched when some data-theme was present.
    assert.doesNotMatch(css, /\(html\[data-theme/);
    assert.doesNotMatch(css, /\[data-theme\]:not\(\[data-theme="dark"\]\)/);
  });

  it('gives the Stripe Payment Element the resolved page theme', () => {
    const stripe = read('components', 'StripePayment.tsx');
    assert.match(stripe, /useTheme\(\)/);
    assert.match(stripe, /resolved/);
  });
});

describe('map', () => {
  it('gives the Leaflet wrapper a real, responsive height', () => {
    const mapView = read('components', 'MapView.tsx');
    assert.match(mapView, /<div className="map">/);
    assert.match(mapView, /<MapContainer[^>]*style=\{\{ height: '100%', width: '100%' \}\}/);
    const rule = cssRule('.map');
    assert.match(rule, /height:\s*clamp\(\s*\d+px\s*,\s*\d+vh\s*,\s*\d+px\s*\)/);
    assert.match(rule, /width:\s*100%/);
  });
});

describe('navigation', () => {
  const layout = read('components', 'Layout.tsx');

  it('offers the customer Dashboard, My Bookings and Profile to customers only', () => {
    assert.match(layout, /const customer = user\?\.role === 'USER'/);
    assert.match(layout, /\{customer && <NavLink to="\/dashboard">Dashboard<\/NavLink>\}/);
    assert.match(layout, /\{customer && <NavLink to="\/bookings">My Bookings<\/NavLink>\}/);
    assert.match(layout, /<NavLink to="\/profile"/);
  });
});

describe('accessibility', () => {
  it('labels the admin search fields', () => {
    assert.match(read('pages', 'admin', 'People.tsx'), /aria-label="Search customers"/);
    assert.match(read('pages', 'admin', 'Bookings.tsx'), /aria-label="Search bookings"/);
  });

  it('shows a visible focus outline on form fields', () => {
    const rule = cssRule('input:focus, select:focus, textarea:focus');
    assert.match(rule, /outline:\s*2px solid var\(--brand\)/);
    assert.doesNotMatch(rule, /outline:\s*none/);
  });

  it('uses disclosure semantics for the theme switcher instead of an incomplete menu', () => {
    const layout = read('components', 'Layout.tsx');
    assert.doesNotMatch(layout, /role="menu|role="menuitem/);
    assert.match(layout, /aria-expanded=\{open\}/);
    assert.match(layout, /aria-controls="theme-options"/);
    assert.match(layout, /aria-pressed=\{theme === opt\.value\}/);
    assert.match(layout, /e\.key === 'Escape'/);
  });
});

describe('project metadata', () => {
  it('ships the favicon that index.html references', () => {
    const href = indexHtml.match(/<link rel="icon"[^>]*href="\/([^"]+)"/)?.[1];
    assert.ok(href, 'favicon link exists');
    const file = join(root, 'public', href);
    assert.ok(existsSync(file), `public/${href} exists`);
    assert.match(readFileSync(file, 'utf8'), /^<svg[\s\S]*<\/svg>\s*$/);
  });

  it('accepts every payment method the backend can return', () => {
    assert.match(read('types.ts'), /method: 'CARD' \| 'ONLINE' \| 'CASH';/);
  });

  it('keeps type-only packages out of the runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const name of Object.keys(pkg.dependencies)) assert.doesNotMatch(name, /^@types\//);
    assert.ok(pkg.devDependencies['@types/leaflet']);
  });

  it('ignores environment variants but not an example file', () => {
    const lines = readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/);
    assert.ok(lines.includes('.env.*'));
    assert.ok(lines.includes('!.env.example'));
    assert.ok(lines.indexOf('!.env.example') > lines.indexOf('.env.*'));
  });

  it('encodes route ids before putting them into API paths', () => {
    for (const page of ['BookingDetail.tsx', 'Checkout.tsx', 'ScooterBook.tsx']) {
      const source = read('pages', page);
      assert.match(source, /encodeURIComponent\(id\)/, page);
      assert.doesNotMatch(source, /api\.\w+<[^>]+>\(`\/(bookings|scooters)\/\$\{id\}/, page);
    }
  });
});
