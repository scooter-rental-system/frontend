// Run with `npm test` (Node's built-in test runner; type stripping loads notifications.ts).
// The API and timers below are TEST-ONLY stand-ins for the backend and the browser; no network is used.
// Production code never creates notifications: it shows what GET /api/notifications returns.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  badgeText,
  bellLabel,
  BROADCAST_MESSAGE_MAX,
  BROADCAST_SUBJECT_MAX,
  broadcastProblem,
  createNotificationCenter,
  MARK_ALL_FAILED,
  MARK_READ_FAILED,
  markReadPath,
  NOTIFICATIONS_PATH,
  NOTIFICATIONS_UNAVAILABLE,
  READ_ALL_PATH,
  REFRESH_INTERVAL_MS,
  SESSION_ENDED,
  UNREAD_COUNT_PATH,
} from './notifications.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

const note = (id, read = false) => ({
  id,
  subject: `Subject ${id}`,
  message: `Message ${id}`,
  read,
  createdAt: '2026-10-25T09:00:00',
});

/** TEST-ONLY backend: an inbox with read flags; requests are recorded and can be failed. */
function fakeBackend(initial = []) {
  let inbox = initial.map((n) => ({ ...n }));
  const calls = [];
  const failures = new Map(); // path -> status for the next request
  const unread = () => inbox.filter((n) => !n.read).length;
  const fail = (path) => {
    const status = failures.get(path);
    if (status === undefined) return;
    failures.delete(path);
    throw Object.assign(new Error(`HTTP ${status}: internal provider detail`), { status });
  };
  const respond = async (method, path, answer) => {
    calls.push(`${method} ${path}`);
    fail(path);
    return answer();
  };
  return {
    calls,
    failNext: (path, status) => failures.set(path, status),
    setInbox: (items) => (inbox = items.map((n) => ({ ...n }))),
    api: {
      get: (path) =>
        respond('GET', path, () => {
          if (path === NOTIFICATIONS_PATH) return inbox.map((n) => ({ ...n }));
          if (path === UNREAD_COUNT_PATH) return { count: unread() };
          throw new Error(`unexpected GET ${path}`);
        }),
      post: (path) =>
        respond('POST', path, () => {
          if (path === READ_ALL_PATH) inbox.forEach((n) => (n.read = true));
          else {
            const item = inbox.find((n) => markReadPath(n.id) === path);
            if (!item) throw Object.assign(new Error('HTTP 404'), { status: 404 });
            item.read = true;
          }
          return undefined;
        }),
    },
  };
}

/** TEST-ONLY interval timers. */
function fakeTimers() {
  const active = new Set();
  return {
    active,
    setInterval: (fn, ms) => {
      const t = { fn, ms };
      active.add(t);
      return t;
    },
    clearInterval: (t) => active.delete(t),
    async tick() {
      for (const t of [...active]) t.fn();
      await settle();
    },
  };
}

function center(backend) {
  const timers = fakeTimers();
  const states = [];
  const c = createNotificationCenter({ api: backend.api, onChange: (s) => states.push(s), timers });
  return { c, timers, states, state: () => c.getState() };
}

describe('unread badge', () => {
  it('shows nothing for zero, the number up to 99, then 99+', () => {
    assert.equal(badgeText(0), null);
    assert.equal(badgeText(1), '1');
    assert.equal(badgeText(99), '99');
    assert.equal(badgeText(100), '99+');
    assert.equal(badgeText(12345), '99+');
  });

  it('keeps the real count in the accessible name', () => {
    assert.equal(bellLabel(null), 'Notifications');
    assert.equal(bellLabel(0), 'Notifications');
    assert.equal(bellLabel(1), 'Notifications, 1 unread');
    assert.equal(bellLabel(250), 'Notifications, 250 unread');
  });
});

describe('API paths', () => {
  it("are the BE-034 endpoints, with no user id: the backend takes the user from the token", () => {
    assert.equal(NOTIFICATIONS_PATH, '/notifications');
    assert.equal(UNREAD_COUNT_PATH, '/notifications/unread-count');
    assert.equal(READ_ALL_PATH, '/notifications/read-all');
    assert.equal(markReadPath('a1'), '/notifications/a1/read');
    assert.equal(markReadPath('../x'), '/notifications/..%2Fx/read');
  });
});

describe('notification center', () => {
  it("shows the backend's unread count, including zero", async () => {
    const backend = fakeBackend([note('a'), note('b'), note('c', true)]);
    const t = center(backend);
    t.c.start();
    await settle();
    assert.equal(t.state().unread, 2);
    assert.deepEqual(backend.calls, [`GET ${UNREAD_COUNT_PATH}`], 'the inbox is not loaded until opened');

    const empty = center(fakeBackend([]));
    empty.c.start();
    await settle();
    assert.equal(empty.state().unread, 0);
  });

  it('loads the inbox when opened, in the order the backend returned it, with read state', async () => {
    const backend = fakeBackend([note('new'), note('old', true)]);
    const t = center(backend);
    const opening = t.c.open();
    assert.equal(t.state().loading, true);
    assert.equal(t.state().items, null);
    await opening;
    assert.equal(t.state().loading, false);
    assert.deepEqual(
      t.state().items.map((n) => [n.id, n.read]),
      [['new', false], ['old', true]],
    );
    assert.equal(t.state().unread, 1);
  });

  it('an empty inbox stays empty', async () => {
    const t = center(fakeBackend([]));
    await t.c.open();
    assert.deepEqual(t.state().items, []);
    assert.equal(t.state().unread, 0);
  });

  it('marks one notification read and re-reads the count from the backend', async () => {
    const backend = fakeBackend([note('a'), note('b')]);
    const t = center(backend);
    await t.c.open();
    backend.calls.length = 0;

    await t.c.markRead('a');
    assert.deepEqual(backend.calls, [`POST ${markReadPath('a')}`, `GET ${UNREAD_COUNT_PATH}`]);
    assert.equal(t.state().items.find((n) => n.id === 'a').read, true);
    assert.equal(t.state().items.find((n) => n.id === 'b').read, false);
    assert.equal(t.state().unread, 1);
    assert.equal(t.state().marking.size, 0);
  });

  it('never sends mark-read for an already read notification, or twice at once', async () => {
    const backend = fakeBackend([note('a'), note('r', true)]);
    const t = center(backend);
    await t.c.open();
    backend.calls.length = 0;

    await t.c.markRead('r');
    await Promise.all([t.c.markRead('a'), t.c.markRead('a')]);
    await t.c.markRead('a');
    await t.c.markRead('unknown');
    assert.deepEqual(
      backend.calls.filter((c) => c.startsWith('POST')),
      [`POST ${markReadPath('a')}`],
    );
  });

  it('marks all read, then reloads the inbox and the count from the backend', async () => {
    const backend = fakeBackend([note('a'), note('b'), note('c', true)]);
    const t = center(backend);
    await t.c.open();
    backend.calls.length = 0;

    await t.c.markAllRead();
    assert.equal(backend.calls[0], `POST ${READ_ALL_PATH}`);
    assert.ok(backend.calls.includes(`GET ${NOTIFICATIONS_PATH}`));
    assert.ok(backend.calls.includes(`GET ${UNREAD_COUNT_PATH}`));
    assert.equal(t.state().unread, 0);
    assert.ok(t.state().items.every((n) => n.read));
    assert.equal(t.state().markingAll, false);
  });

  it('does not offer mark-all when nothing is unread', async () => {
    const backend = fakeBackend([note('a', true)]);
    const t = center(backend);
    await t.c.open();
    backend.calls.length = 0;
    await t.c.markAllRead();
    assert.deepEqual(backend.calls, []);
  });

  it('a failed mark-all shows nothing as read', async () => {
    const backend = fakeBackend([note('a'), note('b')]);
    const t = center(backend);
    await t.c.open();
    backend.failNext(READ_ALL_PATH, 500);

    await t.c.markAllRead();
    assert.equal(t.state().error, MARK_ALL_FAILED);
    assert.equal(t.state().unread, 2);
    assert.ok(t.state().items.every((n) => !n.read));
    assert.equal(t.state().markingAll, false);
  });

  it('a failed mark-read leaves the notification unread and the count from the backend', async () => {
    const backend = fakeBackend([note('a')]);
    const t = center(backend);
    await t.c.open();
    backend.failNext(markReadPath('a'), 503);

    await t.c.markRead('a');
    assert.equal(t.state().error, MARK_READ_FAILED);
    assert.equal(t.state().items[0].read, false);
    assert.equal(t.state().unread, 1);
  });

  it('shows a generic message when loading fails, never the backend error text', async () => {
    const backend = fakeBackend([note('a')]);
    const t = center(backend);
    backend.failNext(NOTIFICATIONS_PATH, 500);
    await t.c.open();
    assert.equal(t.state().error, NOTIFICATIONS_UNAVAILABLE);
    assert.equal(t.state().items, null);
    assert.equal(t.state().loading, false);
    assert.doesNotMatch(t.state().error, /provider|HTTP/);

    await t.c.open(); // trying again works
    assert.equal(t.state().error, null);
    assert.equal(t.state().items.length, 1);
  });

  it('stops asking once the session has ended (401)', async () => {
    const backend = fakeBackend([note('a')]);
    const t = center(backend);
    backend.failNext(UNREAD_COUNT_PATH, 401);
    t.c.start();
    await settle();
    assert.equal(t.state().signedOut, true);
    assert.equal(t.state().error, SESSION_ENDED);
    assert.equal(t.timers.active.size, 0, 'no more periodic refresh');

    backend.calls.length = 0;
    await t.c.refresh();
    await t.c.open();
    await t.c.markAllRead();
    assert.deepEqual(backend.calls, []);
  });

  it('refreshes the count periodically, the inbox too while it is open', async () => {
    const backend = fakeBackend([note('a')]);
    const t = center(backend);
    t.c.start();
    await settle();
    assert.equal(t.timers.active.size, 1);
    assert.equal([...t.timers.active][0].ms, REFRESH_INTERVAL_MS);

    backend.setInbox([note('b'), note('a')]); // a new notification arrives on the server
    backend.calls.length = 0;
    await t.timers.tick();
    assert.deepEqual(backend.calls, [`GET ${UNREAD_COUNT_PATH}`]);
    assert.equal(t.state().unread, 2);

    await t.c.open();
    backend.calls.length = 0;
    await t.timers.tick();
    assert.deepEqual(backend.calls.sort(), [`GET ${NOTIFICATIONS_PATH}`, `GET ${UNREAD_COUNT_PATH}`]);

    t.c.close();
    backend.calls.length = 0;
    await t.timers.tick();
    assert.deepEqual(backend.calls, [`GET ${UNREAD_COUNT_PATH}`]);
  });

  it('pauses while the page is hidden and refreshes when it is shown again', async () => {
    const backend = fakeBackend([note('a')]);
    const t = center(backend);
    t.c.start();
    await settle();
    t.c.setVisible(false);
    assert.equal(t.timers.active.size, 0);

    backend.calls.length = 0;
    t.c.setVisible(true);
    await settle();
    assert.equal(t.timers.active.size, 1);
    assert.deepEqual(backend.calls, [`GET ${UNREAD_COUNT_PATH}`]);

    t.c.stop();
    assert.equal(t.timers.active.size, 0);
  });

  it('a slow, older count never overwrites the count read after a change', async () => {
    const backend = fakeBackend([note('a'), note('b')]);
    const t = center(backend);
    await t.c.open();

    // An older count request answers late, after mark-all has re-read the count.
    let releaseOld;
    const realGet = backend.api.get;
    backend.api.get = (path) =>
      path === UNREAD_COUNT_PATH && !releaseOld
        ? new Promise((resolve) => (releaseOld = () => resolve({ count: 2 })))
        : realGet(path);
    const stale = t.c.refresh();
    await t.c.markAllRead();
    assert.equal(t.state().unread, 0);
    releaseOld();
    await stale;
    assert.equal(t.state().unread, 0);
  });
});

describe('broadcast limits', () => {
  it('match the backend (subject 255, message 4000)', () => {
    assert.equal(BROADCAST_SUBJECT_MAX, 255);
    assert.equal(BROADCAST_MESSAGE_MAX, 4000);
  });

  it('require a subject and a message and reject longer ones', () => {
    assert.equal(broadcastProblem('Road closure', 'Kandy town closed'), null);
    assert.match(broadcastProblem('   ', 'x'), /subject/);
    assert.match(broadcastProblem('x', '  '), /message/);
    assert.equal(broadcastProblem('s'.repeat(255), 'm'.repeat(4000)), null);
    assert.match(broadcastProblem('s'.repeat(256), 'm'), /255/);
    assert.match(broadcastProblem('s', 'm'.repeat(4001)), /4000/);
  });
});

describe('production source', () => {
  const src = fileURLToPath(new URL('.', import.meta.url));
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const production = files(src).filter((f) => /\.(ts|tsx)$/.test(f));
  const read = (...parts) => readFileSync(join(src, ...parts), 'utf8');

  it('has no mock-mode or mock notification wording', () => {
    for (const file of production) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /mock ?mode|mock (notification|email|sms)|fake notification/i, file);
    }
  });

  it('claims no SMS delivery (the backend has no SMS provider)', () => {
    const page = read('pages', 'admin', 'People.tsx');
    assert.doesNotMatch(page, /SMS/);
    assert.doesNotMatch(page, /in-app, email and SMS/i);
    assert.match(page, /maxLength=\{BROADCAST_SUBJECT_MAX\}/);
    assert.match(page, /maxLength=\{BROADCAST_MESSAGE_MAX\}/);
  });

  it('keeps notifications out of storage and the console, and invents none', () => {
    for (const name of ['notifications.ts', 'useNotifications.ts', join('components', 'NotificationBell.tsx')]) {
      const text = read(name);
      assert.doesNotMatch(text, /localStorage|sessionStorage|console\.|Math\.random/, name);
      assert.doesNotMatch(text, /userId|user\.id/, name);
    }
    assert.match(read('useNotifications.ts'), /import \{ api \} from '\.\/api'/, 'uses the authenticated API client');
  });

  it('shows the bell only to signed-in users', () => {
    assert.match(read('components', 'Layout.tsx'), /\{user && <NotificationBell \/>\}/);
  });
});
