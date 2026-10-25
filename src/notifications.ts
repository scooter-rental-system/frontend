/**
 * The signed-in user's in-app notifications (BE-034). The backend picks the user from the token and returns their
 * 200 most recent in-app notifications, newest first; nothing here sends a user id, and nothing is invented or
 * stored. The unread count shown is always the backend's own count, re-read after every change.
 *
 * Kept free of React and of browser globals (the API and timers are passed in), so the rules can be tested alone.
 */
import type { Notification } from './types';

export const NOTIFICATIONS_PATH = '/notifications';
export const UNREAD_COUNT_PATH = '/notifications/unread-count';
export const READ_ALL_PATH = '/notifications/read-all';
export const markReadPath = (id: string) => `/notifications/${encodeURIComponent(id)}/read`;

/** The unread count is re-read this often while the app is visible; opening the inbox and every change also
 *  re-read it. Notifications are not urgent (bookings, payments, reminders), so once a minute is plenty. */
export const REFRESH_INTERVAL_MS = 60_000;

export const NOTIFICATIONS_UNAVAILABLE = 'Unable to load notifications right now. Please try again shortly.';
export const MARK_READ_FAILED = 'Unable to mark the notification as read. Please try again.';
export const MARK_ALL_FAILED = 'Unable to mark your notifications as read. Please try again.';
export const SESSION_ENDED = 'Your session has ended. Please log in again to see your notifications.';

/** The badge text: nothing for 0, the number up to 99, then "99+" (the real count stays in the state). */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** The bell's accessible name, with the real count. */
export function bellLabel(count: number | null): string {
  if (!count) return 'Notifications';
  return `Notifications, ${count} unread`;
}

export interface NotificationApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string): Promise<T>;
}

export interface Timers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const browserTimers: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface InboxState {
  /** The backend's unread count; null until first read. */
  unread: number | null;
  /** The inbox as the backend returned it (its order); null until opened. */
  items: Notification[] | null;
  loading: boolean;
  /** A mark-all request is in flight. */
  markingAll: boolean;
  /** Notifications whose mark-read request is in flight. */
  marking: ReadonlySet<string>;
  /** A customer-facing message; backend error details are not shown. */
  error: string | null;
  /** The session ended (401); the app signs the user out and polling stops. */
  signedOut: boolean;
}

export const INITIAL_STATE: InboxState = {
  unread: null,
  items: null,
  loading: false,
  markingAll: false,
  marking: new Set(),
  error: null,
  signedOut: false,
};

const httpStatus = (e: unknown) => (e as { status?: number } | null)?.status;

export interface NotificationCenter {
  /** Starts the periodic unread-count refresh (and reads it now). */
  start(): void;
  stop(): void;
  /** Re-reads the unread count, and the inbox too when it is open. */
  refresh(): Promise<void>;
  /** Loads the inbox and the unread count. */
  open(): Promise<void>;
  close(): void;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** Pauses or resumes the periodic refresh (page hidden or visible); resuming refreshes at once. */
  setVisible(visible: boolean): void;
  getState(): InboxState;
}

/**
 * Inbox and unread-count state. Responses that arrive after a newer request for the same thing are dropped, so a
 * slow periodic refresh can never overwrite the count read after a change.
 */
export function createNotificationCenter({
  api,
  onChange,
  intervalMs = REFRESH_INTERVAL_MS,
  timers = browserTimers,
}: {
  api: NotificationApi;
  onChange: (state: InboxState) => void;
  intervalMs?: number;
  timers?: Timers;
}): NotificationCenter {
  let state = INITIAL_STATE;
  let isOpen = false;
  let visible = true;
  let running = false;
  let ticker: unknown = null;
  let countSeq = 0;
  let listSeq = 0;

  const set = (patch: Partial<InboxState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  /** A 401 ends the session (the API client signs the user out); stop asking. */
  const failed = (e: unknown, message: string) => {
    if (httpStatus(e) === 401) {
      stopTicker();
      running = false;
      set({ signedOut: true, error: SESSION_ENDED, loading: false });
      return;
    }
    set({ error: message });
  };

  const loadCount = async () => {
    const seq = ++countSeq;
    try {
      const { count } = await api.get<{ count: number }>(UNREAD_COUNT_PATH);
      if (seq === countSeq && !state.signedOut) {
        set({ unread: count, error: state.error === NOTIFICATIONS_UNAVAILABLE ? null : state.error });
      }
    } catch (e) {
      if (seq === countSeq) failed(e, NOTIFICATIONS_UNAVAILABLE);
    }
  };

  const loadList = async () => {
    const seq = ++listSeq;
    set({ loading: true });
    try {
      const items = await api.get<Notification[]>(NOTIFICATIONS_PATH);
      if (seq === listSeq && !state.signedOut) set({ items, loading: false, error: null });
    } catch (e) {
      if (seq === listSeq) {
        set({ loading: false });
        failed(e, NOTIFICATIONS_UNAVAILABLE);
      }
    }
  };

  const refresh = async () => {
    if (state.signedOut) return;
    await Promise.all(isOpen ? [loadCount(), loadList()] : [loadCount()]);
  };

  const startTicker = () => {
    if (ticker === null) ticker = timers.setInterval(() => void refresh(), intervalMs);
  };
  const stopTicker = () => {
    if (ticker !== null) timers.clearInterval(ticker);
    ticker = null;
  };

  return {
    start() {
      if (running) return;
      running = true;
      if (visible) startTicker();
      void refresh();
    },
    stop() {
      running = false;
      stopTicker();
    },
    refresh,
    async open() {
      isOpen = true;
      if (state.signedOut) return;
      set({ error: null });
      await Promise.all([loadList(), loadCount()]);
    },
    close() {
      isOpen = false;
    },
    async markRead(id) {
      const item = state.items?.find((n) => n.id === id);
      // Nothing to do for an unknown, already read or already being marked notification.
      if (!item || item.read || state.marking.has(id) || state.markingAll || state.signedOut) return;
      set({ marking: new Set(state.marking).add(id), error: null });
      try {
        await api.post(markReadPath(id));
        set({ items: state.items?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null });
      } catch (e) {
        failed(e, MARK_READ_FAILED);
        if (httpStatus(e) === 404) void loadList(); // no longer in this user's inbox
      } finally {
        const marking = new Set(state.marking);
        marking.delete(id);
        set({ marking });
      }
      if (!state.signedOut) await loadCount();
    },
    async markAllRead() {
      if (state.markingAll || state.signedOut || !state.unread) return;
      set({ markingAll: true, error: null });
      try {
        await api.post(READ_ALL_PATH);
      } catch (e) {
        set({ markingAll: false });
        failed(e, MARK_ALL_FAILED); // nothing is shown as read: the list and count are left as the backend had them
        return;
      }
      set({ markingAll: false });
      await Promise.all([loadList(), loadCount()]);
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      if (!running) return;
      if (v) {
        startTicker();
        void refresh();
      } else {
        stopTicker();
      }
    },
    getState: () => state,
  };
}
