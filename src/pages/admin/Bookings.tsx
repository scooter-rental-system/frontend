import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Empty, ErrorAlert, Loading, StageBadge } from '../../components/ui';
import { dateTime, humanize, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { initials } from '../../admin';
import { AdminIcon } from '../../components/AdminIcon';
import { useConfirm } from '../../useConfirm';
import { adminBookingPath } from '../../routes';
import type { Booking, BookingStatus, Dashboard } from '../../types';

const STATUSES: (BookingStatus | '')[] = ['', 'PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

export default function Bookings() {
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [search, setSearch] = useState('');
  const list = useLoad(() => api.get<Booking[]>(`/admin/bookings${status ? `?status=${status}` : ''}`), [status]);
  // The summary cards use the server's own counts, not the filtered list below.
  const summary = useLoad(() => api.get<Dashboard>('/admin/dashboard'));
  const action = useAction();
  const { confirm, dialog } = useConfirm();

  const q = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (b) =>
      !q ||
      b.reference.toLowerCase().includes(q) ||
      b.customer.fullName.toLowerCase().includes(q) ||
      b.scooter.code.toLowerCase().includes(q),
  );

  // The customer normally ends their own rental; an admin can do it for them (e.g. scooter left at the office).
  const endRental = async (b: Booking) => {
    const ok = await confirm({
      title: `End ${b.reference}?`,
      message: `End the rental for ${b.customer.fullName}? The final total is charged to their card.`,
      confirmLabel: 'End rental',
    });
    if (!ok) return;
    await action.run(() => api.put(`/bookings/${encodeURIComponent(b.id)}/complete`, {}));
    list.reload();
    summary.reload();
  };

  const cancel = async (b: Booking) => {
    const msg = b.status === 'ACTIVE' ? `Cancel ${b.reference}? The customer is refunded in full.` : `Cancel ${b.reference}?`;
    const ok = await confirm({
      title: `Cancel ${b.reference}?`,
      message: msg,
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
      destructive: true,
    });
    if (!ok) return;
    if (await action.run(() => api.post(`/bookings/${encodeURIComponent(b.id)}/cancel`))) {
      list.reload();
      summary.reload();
    }
  };

  return (
    <div className="admin-page">
      {dialog}
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Rentals</span>
          <h1>
            Bookings <span className="accent-text">registry</span>
          </h1>
          <p className="muted">Every booking, newest first. Open a reference for its full detail, tracking and invoices.</p>
        </div>
      </div>

      {summary.data && (
        <section aria-label="Bookings needing action" className="kpi-grid">
          <div className="kpi">
            <div className="kpi__label">On the road</div>
            <div className="kpi__value">{summary.data.activeRentals}</div>
            <div className="kpi__hint">Rentals in progress</div>
          </div>
          <div className={`kpi${summary.data.pendingPayment > 0 ? ' is-attention' : ''}`}>
            <div className="kpi__label">Awaiting payment</div>
            <div className="kpi__value">{summary.data.pendingPayment}</div>
            <div className="kpi__hint">Booked, not paid</div>
          </div>
          <div className="kpi">
            <div className="kpi__label">Upcoming</div>
            <div className="kpi__value">{summary.data.upcoming}</div>
            <div className="kpi__hint">Paid, not started</div>
          </div>
          <div className={`kpi${summary.data.balanceDue > 0 ? ' is-attention' : ''}`}>
            <div className="kpi__label">Balance due</div>
            <div className="kpi__value">{summary.data.balanceDue}</div>
            <div className="kpi__hint">Ended, charge failed</div>
          </div>
        </section>
      )}

      <div className="admin-toolbar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? humanize(s) : 'All statuses'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            aria-label="Search bookings"
            placeholder="Search reference, customer, scooter"
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

      <ErrorAlert error={list.error ?? summary.error ?? action.error} />
      {list.loading && <Loading what="Loading bookings" />}
      {list.data && rows.length === 0 && <Empty>No bookings match.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Reference</th>
                <th scope="col">Scooter</th>
                <th scope="col">Started / ended</th>
                <th scope="col">Stage</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td data-label="Customer">
                    <div className="cell-person">
                      <span className="avatar" aria-hidden>
                        {initials(b.customer.fullName)}
                      </span>
                      <div>
                        <strong>{b.customer.fullName}</strong>
                        <span className="cell-sub">{b.customer.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Reference">
                    <Link to={adminBookingPath(b.id)}>{b.reference}</Link>
                  </td>
                  <td data-label="Scooter">
                    <div className="cell-scooter">
                      <span className="scooter-tile" aria-hidden>
                        <AdminIcon name="scooter" />
                      </span>
                      <div>
                        <strong>{b.scooter.code}</strong>
                        <span className="cell-sub">{b.scooter.model}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Started / ended">
                    {dateTime(b.startTime)}
                    {b.endTime && <span className="cell-sub">→ {dateTime(b.endTime)}</span>}
                  </td>
                  <td data-label="Stage">
                    <StageBadge stage={b.stage} status={b.status} />
                    {b.stage === 'BALANCE_DUE' && <span className="cell-sub">Due {money(b.payment?.balanceDue)}</span>}
                  </td>
                  <td data-label="Total" className="num">
                    {b.totalCost != null ? money(b.totalCost) : b.payment ? <span className="muted">paid {money(b.payment.amount)}</span> : '—'}
                  </td>
                  <td className="actions">
                    <div className="row">
                      {b.stage === 'IN_PROGRESS' && (
                        <button className="small primary" disabled={action.busy} onClick={() => endRental(b)}>
                          End rental
                        </button>
                      )}
                      {(b.stage === 'AWAITING_PAYMENT' || b.stage === 'PAYMENT_FAILED' || b.stage === 'UPCOMING') && (
                        <button className="small danger" disabled={action.busy} onClick={() => cancel(b)}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-foot">
            <span>
              Showing {rows.length} of {list.data?.length ?? 0} bookings
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
