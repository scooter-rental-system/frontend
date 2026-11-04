import { useEffect, useRef, useState } from 'react';
import { dateTime } from '../format';
import { badgeText, bellLabel } from '../notifications';
import type { Notification } from '../types';
import { useNotifications } from '../useNotifications';

/**
 * The header bell: the backend's unread count, and a panel with the signed-in user's in-app notifications.
 * Opening a notification shows its whole message and marks it read.
 */
export function NotificationBell() {
  const { state, center } = useNotifications();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const close = (focusBell: boolean) => {
    setOpen(false);
    center.close();
    if (focusBell) bellRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    setExpanded(null);
    void center.open();
  };

  const select = (n: Notification) => {
    setExpanded(expanded === n.id ? null : n.id);
    if (!n.read) void center.markRead(n.id);
  };

  const badge = badgeText(state.unread ?? 0);
  const items = state.items;

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        ref={bellRef}
        id="btn-notifications"
        className="theme-toggle notif-bell"
        aria-label={bellLabel(state.unread)}
        aria-expanded={open}
        aria-controls="notif-panel"
        aria-haspopup="dialog"
        title="Notifications"
        onClick={toggle}
      >
        <span aria-hidden>🔔</span>
        {badge && (
          <span className="notif-badge" aria-hidden>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div id="notif-panel" className="notif-panel" role="dialog" aria-labelledby="notif-title">
          <div className="notif-head">
            <h2 id="notif-title">Notifications</h2>
            {!!state.unread && (
              <button className="small" disabled={state.markingAll} onClick={() => void center.markAllRead()}>
                {state.markingAll ? 'Marking…' : 'Mark all as read'}
              </button>
            )}
          </div>

          {state.error && (
            <div className="alert small" role="alert">
              {state.error}
            </div>
          )}
          {state.loading && !items && <p className="muted small notif-note">Loading notifications…</p>}
          {items?.length === 0 && (
            <div className="notif-empty">
              <p className="notif-empty__title">You have no notifications.</p>
              <p className="muted small">Booking updates and messages from Scooter Rent Kandy appear here.</p>
            </div>
          )}

          {items && items.length > 0 && (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`notif-item${n.read ? '' : ' is-unread'}`}
                    aria-expanded={expanded === n.id}
                    onClick={() => select(n)}
                  >
                    <span className="notif-item__subject">
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.subject}
                      {!n.read && (
                        <span className="notif-item__new" aria-hidden>
                          New
                        </span>
                      )}
                    </span>
                    <span className={`notif-item__message${expanded === n.id ? ' is-expanded' : ''}`}>{n.message}</span>
                    <time className="muted small" dateTime={n.createdAt}>
                      {dateTime(n.createdAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
