import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyResolvedTheme,
  DARK_QUERY,
  parseTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from './themeMode';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { Theme } from './themeMode';

interface ThemeState {
  /** The user's stored preference: 'light', 'dark', or 'system' (follow OS). */
  theme: Theme;
  /** The effective theme that is actually applied to the document. */
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeState | null>(null);

function getStored(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system'; // Private browsing
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStored);

  // Listen to the OS preference so 'system' mode reacts in real time
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved = resolveTheme(theme, prefersDark);

  // Apply to DOM whenever resolved changes (index.html already applied the saved theme before the first paint)
  useEffect(() => {
    applyResolvedTheme(document.documentElement, resolved);
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
