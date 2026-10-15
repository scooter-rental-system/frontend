"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError | Error }
  | { status: "success"; data: T };

/**
 * Runs `loader` on mount and whenever `key` changes, with a manual `reload`.
 * Pass a `key` of null to skip loading (e.g. until the user is known).
 */
export function useLoad<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    loader(controller.signal).then(
      (data) => setState({ status: "success", data }),
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", error: e instanceof Error ? e : new Error(String(e)) });
      },
    );
    return () => controller.abort();
    // `loader` is recreated each render; `key` and `attempt` decide when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}
