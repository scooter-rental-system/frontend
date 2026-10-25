import { useState } from 'react';
import { api } from '../../api';
import { Empty, ErrorAlert, Loading, StatusBadge } from '../../components/ui';
import { date, dateTime } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { BROADCAST_MESSAGE_MAX, BROADCAST_SUBJECT_MAX, broadcastProblem } from '../../notifications';
import type { NotificationLog, User } from '../../types';

export function Customers() {
  const list = useLoad(() => api.get<User[]>('/admin/customers'));
  const [search, setSearch] = useState('');
  const action = useAction();
  const q = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? '').includes(q),
  );

  const toggle = async (u: User) => {
    if (!window.confirm(`${u.active ? 'Block' : 'Unblock'} ${u.fullName}?`)) return;
    if (await action.run(() => api.patch(`/admin/customers/${u.id}/active?value=${!u.active}`))) list.reload();
  };

  return (
    <div className="stack">
      <h1>Customers</h1>
      <input placeholder="Search name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      <ErrorAlert error={list.error ?? action.error} />
      {list.loading && <Loading />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Country</th>
              <th>ID / Licence</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.fullName}
                  {!u.active && (
                    <div>
                      <span className="badge red">Blocked</span>
                    </div>
                  )}
                </td>
                <td>
                  {u.email}
                  <div className="muted small">{u.phone}</div>
                </td>
                <td>{u.country ?? '—'}</td>
                <td className="small">
                  {u.idDocumentNumber ?? '—'}
                  <div className="muted">{u.drivingLicenseNo ?? 'No licence on file'}</div>
                </td>
                <td>{date(u.createdAt)}</td>
                <td className="right">
                  <button className={`small ${u.active ? 'danger' : ''}`} disabled={action.busy} onClick={() => toggle(u)}>
                    {u.active ? 'Block' : 'Unblock'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  const broadcast = async () => {
    if (problem) return;
    if (!window.confirm('Send this in-app notification to every active customer?')) return;
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
    <div className="stack">
      <h1>Notifications</h1>
      <p className="muted small">
        A broadcast creates an in-app notification for every active customer. A copy is emailed only when email
        delivery is configured on the server; each email&apos;s outcome appears in the log below.
      </p>
      <div className="card stack">
        <h2>Broadcast to customers</h2>
        <label>
          Subject
          <input
            value={subject}
            maxLength={BROADCAST_SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Esala Perahera road closures"
          />
          <span className="muted small">
            {subject.length}/{BROADCAST_SUBJECT_MAX}
          </span>
        </label>
        <label>
          Message
          <textarea
            rows={3}
            value={message}
            maxLength={BROADCAST_MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
          />
          <span className="muted small">
            {message.length}/{BROADCAST_MESSAGE_MAX}
          </span>
        </label>
        <ErrorAlert error={action.error} />
        {sent != null && (
          <div className="alert success">In-app notification created for {sent} active customer(s).</div>
        )}
        <div>
          <button className="primary" disabled={!!problem || action.busy} onClick={broadcast}>
            Send
          </button>
        </div>
      </div>

      <h2>Recent messages</h2>
      <ErrorAlert error={log.error} />
      {log.loading && <Loading />}
      {log.data?.length === 0 && <Empty>No notifications yet.</Empty>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Recipient</th>
              <th>Channel</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.map((n) => (
              <tr key={n.id}>
                <td>{dateTime(n.createdAt)}</td>
                <td>{n.recipient}</td>
                <td>{n.channel.replace('_', '-').toLowerCase()}</td>
                <td>{n.subject}</td>
                <td>
                  <StatusBadge status={n.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
