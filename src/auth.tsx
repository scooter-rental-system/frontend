import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { AuthResponse, RegisterFormData, User } from './types';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthState {
  /** Currently authenticated user, or null when logged out. */
  user: User | null;
  /** True while the initial token → /me check is in flight. */
  loading: boolean;
  login:    (email: string, password: string) => Promise<User>;
  register: (data: RegisterFormData) => Promise<User>;
  logout:   () => void;
  /** Re-fetch /me (e.g. after a profile update). */
  refresh:  () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.get<User>('/me'));
    } catch {
      logout();
    }
  }, [logout]);

  // On mount: register the 401 handler and restore the session from localStorage
  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh().finally(() => setLoading(false));
  }, [logout, refresh]);

  /** POST /api/auth/login → stores token → updates user state. */
  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  /** POST /api/auth/register → stores token → updates user state. */
  const register = useCallback(async (data: RegisterFormData) => {
    const res = await api.post<AuthResponse>('/auth/register', data);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
