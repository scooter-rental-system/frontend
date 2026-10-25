/**
 * Colour theme rules, kept free of React so they can be tested alone. The inline script in index.html applies the
 * same rules before the app renders (so a saved theme does not flash the wrong one); keep the two in step.
 *
 * The resolved theme is always written to <html data-theme>, so the CSS never has to guess: an explicit Light
 * stays light on a dark-mode device, and System follows prefers-color-scheme (ThemeProvider tracks changes).
 */
export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'srs.theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** A stored preference; anything unknown (or nothing) means System. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  style: { colorScheme: string };
}

export function applyResolvedTheme(root: ThemeRoot, resolved: ResolvedTheme) {
  root.setAttribute('data-theme', resolved);
  // Native browser chrome (scrollbars, form controls) follows too.
  root.style.colorScheme = resolved;
}
