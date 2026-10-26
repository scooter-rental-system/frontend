import { useState } from 'react';
import { api } from '../../api';
import { CHANNEL_LABEL, initials } from '../../admin';
import { useConfirm } from '../../useConfirm';
import { Empty, ErrorAlert, Loading, StatusBadge } from '../../components/ui';
import { date, dateTime } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { BROADCAST_MESSAGE_MAX, BROADCAST_SUBJECT_MAX, broadcastProblem } from '../../notifications';
import type { NotificationLog, User } from '../../types';

export function Customers() {
  const list = useLoad(() => api.get<User[]>('/admin/customers'));
  const [search, setSearch] = useState('');
  const action = useAction();
  const { confirm, dialog } = useConfirm();
  const q = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? '').includes(q),
  );

  const toggle = async (u: User) => {
    const ok = await confirm({
      title: `${u.active ? 'Block' : 'Unblock'} ${u.fullName}?`,
      message: u.active ? 'They will not be able to sign in or book until unblocked.' : 'They will be able to sign in and book again.',
      confirmLabel: u.active ? 'Block customer' : 'Unblock customer',
      destructive: u.active,
    });
    if (!ok) return;
    if (await action.run(() => api.patch(`/admin/customers/${u.id}/active?value=${!u.active}`))) list.reload();
  };

  return (
    <div className="admin-page">
      {dialog}
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">People</span>
          <h1>Customers</h1>
          <p className="muted">Registered customer accounts. Blocking stops a customer from signing in and booking.</p>
        </div>
      </div>
      <div className="admin-toolbar">
        <label>
          Search
          <input
            type="search"
            aria-label="Search customers"
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {list.data && (
          <span className="muted small admin-toolbar__count" role="status">
            {rows.length} of {list.data.length}
          </span>
        )}
      </div>
      <ErrorAlert error={list.error ?? action.error} />
      {list.loading && <Loading what="Loading customers" />}
      {list.data && rows.length === 0 && <Empty>No customers match.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Contact</th>
                <th scope="col">Country</th>
                <th scope="col">ID / Licence</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td data-label="Name">
                    <div className="cell-person">
                      <span className="avatar" aria-hidden>
                        {initials(u.fullName)}
                      </span>
                      <div>
                        <strong>{u.fullName}</strong>
                        {!u.active && (
                          <span className="cell-sub">
                            <span className="badge red">Blocked</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="Contact">
                    {u.email}
                    <span className="cell-sub">{u.phone}</span>
                  </td>
                  <td data-label="Country">{u.country ?? '—'}</td>
                  <td data-label="ID / Licence" className="small">
                    {u.idDocumentNumber ?? '—'}
                    <span className="cell-sub">{u.drivingLicenseNo ?? 'No licence on file'}</span>
                  </td>
                  <td data-label="Joined">{date(u.createdAt)}</td>
                  <td className="actions">
                    <div className="row">
                      <button className={`small ${u.active ? 'danger' : ''}`} disabled={action.busy} onClick={() => toggle(u)}>
                        {u.active ? 'Block' : 'Unblock'}
                        <span className="sr-only"> {u.fullName}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NotificationsAdmin() {
  const log = useLoad(() => api.get<NotificationLog[]>('/admin/notifications'));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const action = useAction();

  const problem = broadcastProblem(subject, message);
  const { confirm, dialog } = useConfirm();

  const broadcast = async () => {
    if (problem) return;
    const ok = await confirm({
      title: 'Send this broadcast?',
      message: 'An in-app notification is sent to every active customer. This cannot be undone.',
      confirmLabel: 'Send broadcast',
    });
    if (!ok) return;
    setSent(null);
    const res = await action.run(() => api.post<{ recipients: number }>('/admin/notifications/broadcast', { subject, message }));
    if (res) {
      setSent(res.recipients);
      setSubject('');
      setMessage('');
      log.reload();
    }
  };

  return (
    <div className="admin-page">
      {dialog}
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Communication</span>
          <h1>Notifications</h1>
          <p className="muted">
            A broadcast creates an in-app notification for every active customer. A copy is emailed only when email
            delivery is configured on the server; each email&apos;s outcome appears in the log below.
          </p>
        </div>
      </div>

      <section className="panel-card admin-form" aria-labelledby="broadcast-title">
        <h2 id="broadcast-title">Broadcast to customers</h2>
        <label>
          Subject
          <input
            value={subject}
            maxLength={BROADCAST_SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Esala Perahera road closures"
            aria-describedby="broadcast-subject-count"
          />
          <span id="broadcast-subject-count" className="field-hint">
            {subject.length}/{BROADCAST_SUBJECT_MAX} characters
          </span>
        </label>
        <label>
          Message
          <textarea
            rows={4}
            value={message}
            maxLength={BROADCAST_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby="broadcast-message-count"
          />
          <span id="broadcast-message-count" className="field-hint">
            {message.length}/{BROADCAST_MESSAGE_MAX} characters
          </span>
        </label>
        <p className="muted small">Sent as an in-app notification, and by email only when email delivery is configured.</p>
        <ErrorAlert error={action.error} />
        {sent != null && (
          <div className="alert success" role="status">
            In-app notification created for {sent} active customer(s).
          </div>
        )}
        <div className="admin-form__actions">
          <button className="primary" disabled={!!problem || action.busy} onClick={broadcast}>
            {action.busy ? 'Sending…' : 'Send broadcast'}
          </button>
        </div>
      </section>

      <section className="panel-card" aria-labelledby="log-title">
        <div className="panel-card__head">
          <h2 id="log-title">Recent messages</h2>
        </div>
        <ErrorAlert error={log.error} />
        {log.loading && <Loading what="Loading the message log" />}
        {log.data?.length === 0 && <Empty>No notifications yet.</Empty>}
        {log.data && log.data.length > 0 && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {log.data.map((n) => (
                  <tr key={n.id}>
                    <td data-label="When">{dateTime(n.createdAt)}</td>
                    <td data-label="Recipient">{n.recipient}</td>
                    <td data-label="Channel">{CHANNEL_LABEL[n.channel]}</td>
                    <td data-label="Subject">{n.subject}</td>
                    <td data-label="Status">
                      <StatusBadge status={n.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
