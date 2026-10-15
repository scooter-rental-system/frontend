"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; error: Error }
  | { status: "signed-in"; user: User };

interface AuthContextValue {
  session: SessionState;
  /** Clears the token and local session; the backend token simply expires. */
  signOut: () => void;
  /** Re-reads the current user, e.g. after a failed attempt. */
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Resolves the signed-in user from the stored token via GET /api/me. */
async function loadSession(): Promise<SessionState> {
  if (!getToken()) return { status: "signed-out" };
  try {
    return { status: "signed-in", user: await api.get<User>("/me") };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      setToken(null);
      return { status: "signed-out" };
    }
    return { status: "error", error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((s) => !cancelled && setSession(s));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const signOut = useCallback(() => {
    setToken(null);
    setSession({ status: "signed-out" });
  }, []);

  const refresh = useCallback(() => {
    setSession({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ session, signOut, refresh }), [session, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
