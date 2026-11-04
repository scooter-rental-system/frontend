import { useEffect, useState } from 'react';
import { api } from './api';
import { createNotificationCenter, INITIAL_STATE, type InboxState, type NotificationCenter } from './notifications';

/**
 * The signed-in user's notification state. The unread count is re-read every REFRESH_INTERVAL_MS while the page
 * is visible (paused while it is hidden, refreshed as soon as it is shown again) and after every change.
 */
export function useNotifications(): { state: InboxState; center: NotificationCenter } {
  const [state, setState] = useState<InboxState>(INITIAL_STATE);
  const [center] = useState(() => createNotificationCenter({ api, onChange: setState }));

  useEffect(() => {
    const onVisibility = () => center.setVisible(document.visibilityState === 'visible');
    onVisibility();
    center.start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      center.stop();
    };
  }, [center]);

  return { state, center };
}
