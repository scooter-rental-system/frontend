import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Empty, ErrorAlert, Loading } from '../../components/ui';
import { dateTime, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { RepairPhotos } from '../../components/RepairPhotos';
import {
  APPROVAL_HELP, isRupeeAmount, REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, REPAIR_STATUSES, reimbursementNote,
} from '../../repairs';
import { adminBookingPath } from '../../routes';
import type { RepairReport, RepairStatus } from '../../types';

/**
 * Repair and breakdown reports from riders, with any photos they attached. Admins set the status, add a note and, for
 * a repair the customer arranged themselves, record the approved reimbursement, which is deducted from the rental's
 * final bill once the report is Resolved. Saving moves no money by itself.
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
            Problems reported by riders during a rental. An approved reimbursement on a Resolved report is deducted
            from the customer&apos;s final bill when the rental ends; the customer&apos;s claimed amount never is. Once the
            final bill is calculated the reimbursement can no longer change.
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
    if (approved.trim() !== '' && !isRupeeAmount(approved)) {
      action.setError('Enter the approved amount as rupees (at most two decimals), or leave it empty.');
      return;
    }
    const amount = approved.trim() === '' ? null : Number(approved);
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
          {r.claimedAmount != null && <> · customer claimed {money(r.claimedAmount)} (not deducted until approved)</>}
          {r.approvedAmount != null && <> · approved {money(r.approvedAmount)}. {reimbursementNote(r.status, r.approvedAmount)}</>}
        </p>
      )}
      <RepairPhotos reportId={r.id} photos={r.photos ?? []} showEmpty />
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
                aria-describedby={`${prefix}-approved-help`}
              />
              <span id={`${prefix}-approved-help`} className="field-hint">
                {APPROVAL_HELP}
              </span>
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
