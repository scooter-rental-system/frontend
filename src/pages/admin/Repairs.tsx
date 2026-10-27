import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Empty, ErrorAlert, Loading } from '../../components/ui';
import { dateTime, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, REPAIR_STATUSES } from '../../repairs';
import { adminBookingPath } from '../../routes';
import type { RepairReport, RepairStatus } from '../../types';

/**
 * Repair and breakdown reports from riders. Admins set the status, add a note and, for a repair the customer arranged
 * themselves, record the approved reimbursement. Recording an amount moves no money.
 */
export default function Repairs() {
  const list = useLoad(() => api.get<RepairReport[]>('/admin/repairs'));
  const open = (list.data ?? []).filter((r) => r.status !== 'RESOLVED').length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Repairs &amp; breakdowns</h1>
          <p className="muted">
            Problems reported by riders during a rental. An approved reimbursement is a record only: refund it through
            the payment provider separately if you decide to pay it.
          </p>
        </div>
        {list.data && (
          <dl className="header-stats" aria-label="Repair reports">
            <div className={`header-stat${open > 0 ? ' is-attention' : ''}`}>
              <dt>Open</dt>
              <dd>{open}</dd>
            </div>
            <div className="header-stat">
              <dt>All reports</dt>
              <dd>{list.data.length}</dd>
            </div>
          </dl>
        )}
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data && <Loading what="Loading repair reports" />}
      {list.data?.length === 0 && <Empty>No repair reports yet.</Empty>}
      {list.data && list.data.length > 0 && (
        <ul className="repair-admin-list">
          {list.data.map((r) => (
            <RepairItem key={r.id} report={r} onSaved={list.reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepairItem({ report: r, onSaved }: { report: RepairReport; onSaved: () => void }) {
  const [status, setStatus] = useState<RepairStatus>(r.status);
  const [note, setNote] = useState(r.adminNote ?? '');
  const [approved, setApproved] = useState(r.approvedAmount != null ? String(r.approvedAmount) : '');
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const prefix = `repair-${r.id}`;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const amount = approved.trim() === '' ? null : Number(approved);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      action.setError('Enter the approved amount as a number of rupees, or leave it empty.');
      return;
    }
    const body = { status, adminNote: note.trim() === '' ? null : note, approvedAmount: r.selfArranged ? amount : null };
    const ok = await action.run(() =>
      api.put<RepairReport>(`/admin/repairs/${encodeURIComponent(r.id)}`, body).then(() => true),
    );
    if (ok) {
      setSaved(true);
      onSaved();
    }
  };

  return (
    <li className="panel-card stack">
      <div className="row between">
        <div>
          <strong>{r.scooterCode}</strong> · {r.scooterModel} ({r.plateNumber})
          <div className="muted small">
            <Link to={adminBookingPath(r.bookingId)}>{r.bookingReference}</Link> · {r.customerName}
            {r.customerPhone && <> · {r.customerPhone}</>} · reported {dateTime(r.reportedAt)}
          </div>
        </div>
        <span className={`badge ${REPAIR_STATUS_TONE[r.status]}`}>{REPAIR_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="repair-description">{r.description}</p>
      {r.selfArranged && (
        <p className="small">
          <strong>Repair arranged by the customer</strong>
          {r.claimedAmount != null && <> · claimed {money(r.claimedAmount)}</>}
        </p>
      )}
      <form className="admin-form" onSubmit={save} aria-label={`Review ${r.bookingReference}`}>
        <div className="form-grid">
          <label htmlFor={`${prefix}-status`}>
            Status
            <select id={`${prefix}-status`} value={status} onChange={(e) => setStatus(e.target.value as RepairStatus)}>
              {REPAIR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REPAIR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {r.selfArranged && (
            <label htmlFor={`${prefix}-approved`}>
              Approved reimbursement (LKR)
              <input
                id={`${prefix}-approved`}
                type="number"
                min="0"
                step="0.01"
                value={approved}
                onChange={(e) => setApproved(e.target.value)}
              />
            </label>
          )}
        </div>
        <label htmlFor={`${prefix}-note`}>
          Note to the customer
          <textarea id={`${prefix}-note`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <ErrorAlert error={action.error} />
        {saved && (
          <div className="alert success small" role="status">
            Saved. The customer has been notified.
          </div>
        )}
        <div className="admin-form__actions">
          <button type="submit" className="primary" disabled={action.busy}>
            {action.busy ? 'Saving…' : 'Save review'}
          </button>
        </div>
      </form>
    </li>
  );
}
