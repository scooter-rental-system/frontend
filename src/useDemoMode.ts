import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import { DEMO_STATUS_PATH } from './demo';

/** One check per page load: the backend's mode does not change while it runs. */
let known: Promise<boolean> | null = null;

function checkDemoMode(): Promise<boolean> {
  known ??= api
    .get<{ demo?: boolean }>(DEMO_STATUS_PATH)
    .then((s) => s?.demo === true)
    .catch((e) => {
      // 404: the endpoint does not exist, so this is the normal application. Anything else: ask again later.
      if (!(e instanceof ApiError && e.status === 404)) known = null;
      return false;
    });
  return known;
}

/** True only when the backend reports viva demo mode; false while unknown, signed out, or on any error. */
export function useDemoMode(): boolean {
  const { user } = useAuth();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (!user) {
      setDemo(false);
      return;
    }
    let live = true;
    checkDemoMode().then((d) => {
      if (live) setDemo(d);
    });
    return () => {
      live = false;
    };
  }, [user]);
  return demo;
}
