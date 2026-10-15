import { DependencyList, useCallback, useEffect, useState } from 'react';

// ─── useLoad ─────────────────────────────────────────────────────────────────

/**
 * Fetches data on mount (and when deps change) with built-in loading / error
 * state and a manual `reload` function.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData]       = useState<T | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

// ─── useAction ───────────────────────────────────────────────────────────────

/**
 * Wraps a one-shot async action (form submit, button click, etc.) with
 * `busy` / `error` state and a no-throw `run` wrapper.
 *
 * Usage:
 *   const action = useAction();
 *   const result = await action.run(() => api.post('/something', data));
 *   if (result) { // success path }
 */
export function useAction() {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
