import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Empty, ErrorAlert, Loading } from '../../components/ui';
import { dateTime, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { RepairPhotos } from '../../components/RepairPhotos';
import {
  APPROVAL_HELP, isRupeeAmount, REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, REPAIR_STATUSES, reimbursementNote,
  repairReviewBody, RESOLVE_TO_BILL, savedReviewMessage,
} from '../../repairs';
import { adminBookingPath } from '../../routes';
import type { RepairReport, RepairStatus } from '../../types';

/**
 * Repair and breakdown reports from riders, with any photos they attached. Admins set the status, add a note and, for
 * a repair the customer arranged themselves, record the approved reimbursement, which is deducted from the rental's
 * final bill once the report is Resolved. Saving moves no money by itself.
 *
 * The saved report is the only source of truth: Save review sends what the form shows, and the server's answer
 * replaces the report in the list (badge, form and messages all come from it), so nothing unsaved is ever shown as
 * saved.
 */
export default function Repairs() {
  const list = useLoad(() => api.get<RepairReport[]>('/admin/repairs'));
  // The status each report was saved with, from the server's answer to its last Save review.
  const [saved, setSaved] = useState<{ id: string; status: RepairStatus } | null>(null);
  const open = (list.data ?? []).filter((r) => r.status !== 'RESOLVED').length;

  const onSaved = (updated: RepairReport) => {
    list.setData((reports) => (reports ?? []).map((r) => (r.id === updated.id ? updated : r)));
    setSaved({ id: updated.id, status: updated.status });
  };

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
            // A new saved version (updatedAt) starts the form again from the saved values.
            <RepairItem
              key={`${r.id}@${r.updatedAt}`}
              report={r}
              savedStatus={saved?.id === r.id ? saved.status : null}
              onSaved={onSaved}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepairItem({
  report: r,
  savedStatus,
  onSaved,
}: {
  report: RepairReport;
  /** The status the server saved on this page's last Save review of this report, or null. */
  savedStatus: RepairStatus | null;
  onSaved: (updated: RepairReport) => void;
}) {
  const action = useAction();
  const prefix = `repair-${r.id}`;

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Exactly what the form shows when Save review is clicked.
    const form = new FormData(e.currentTarget);
    const approved = String(form.get('approvedAmount') ?? '').trim();
    if (approved !== '' && !isRupeeAmount(approved)) {
      action.setError('Enter the approved amount as rupees (at most two decimals), or leave it empty.');
      return;
    }
    const body = repairReviewBody(r.selfArranged, form.get('status'), approved, String(form.get('adminNote') ?? ''));
    if (!body) {
      action.setError('Choose a status.');
      return;
    }
    const updated = await action.run(() => api.put<RepairReport>(`/admin/repairs/${encodeURIComponent(r.id)}`, body));
    if (updated) onSaved(updated);
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
        <span className={`badge ${REPAIR_STATUS_TONE[r.status]}`} id={`${prefix}-badge`}>
          {REPAIR_STATUS_LABEL[r.status]}
        </span>
      </div>
      <p className="repair-description">{r.description}</p>
      {r.selfArranged && (
        <p className="small">
          <strong>Repair arranged by the customer</strong>
          {r.claimedAmount != null && <> · customer claimed {money(r.claimedAmount)} (not deducted until approved)</>}
          {r.approvedAmount != null && <> · approved {money(r.approvedAmount)}. {reimbursementNote(r.status, r.approvedAmount)}</>}
        </p>
      )}
      {r.selfArranged && r.status !== 'RESOLVED' && (
        <div className="alert warning small" role="note">
          {RESOLVE_TO_BILL}
        </div>
      )}
      <RepairPhotos reportId={r.id} photos={r.photos ?? []} showEmpty />
      <form className="admin-form" onSubmit={save} autoComplete="off" aria-label={`Review ${r.bookingReference}`}>
        <div className="form-grid">
          <label htmlFor={`${prefix}-status`}>
            Status
            <select id={`${prefix}-status`} name="status" defaultValue={r.status}>
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
                name="approvedAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={r.approvedAmount != null ? String(r.approvedAmount) : ''}
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
          <textarea
            id={`${prefix}-note`}
            name="adminNote"
            rows={2}
            maxLength={2000}
            defaultValue={r.adminNote ?? ''}
          />
        </label>
        <ErrorAlert error={action.error} />
        {savedStatus && (
          <div className="alert success small" role="status" id={`${prefix}-saved`}>
            {savedReviewMessage(r.selfArranged, savedStatus)}
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
