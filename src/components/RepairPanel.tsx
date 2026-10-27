import { FormEvent, useId, useState } from 'react';
import { api } from '../api';
import { dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import { REPAIR_GUIDANCE, REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, repairReportProblem } from '../repairs';
import type { RepairReport, SupportContact } from '../types';
import { ErrorAlert } from './ui';

/**
 * The rider's repair/breakdown reports on their own booking: a report form while the rental is in progress, and the
 * status of earlier reports. Support contact details appear only when the server has them configured.
 */
export function RepairPanel({ bookingId, canReport }: { bookingId: string; canReport: boolean }) {
  const ids = { title: useId(), description: useId(), claimed: useId(), claimHint: useId() };
  const reports = useLoad(() => api.get<RepairReport[]>(`/bookings/${encodeURIComponent(bookingId)}/repairs`), [bookingId]);
  const support = useLoad(() => api.get<SupportContact>('/support/contact'), []);
  const [description, setDescription] = useState('');
  const [selfArranged, setSelfArranged] = useState(false);
  const [claimed, setClaimed] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const action = useAction();

  if (!canReport && (reports.data?.length ?? 0) === 0) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSent(false);
    const issue = repairReportProblem(description, selfArranged, claimed);
    setProblem(issue);
    if (issue) return;
    const body = {
      description: description.trim(),
      selfArranged,
      claimedAmount: selfArranged && claimed.trim() !== '' ? Number(claimed) : null,
    };
    const created = await action.run(() =>
      api.post<RepairReport>(`/bookings/${encodeURIComponent(bookingId)}/repairs`, body),
    );
    if (created) {
      setSent(true);
      setDescription('');
      setSelfArranged(false);
      setClaimed('');
      reports.reload();
    }
  };

  const contact = support.data;

  return (
    <section className="card stack repair-panel" aria-labelledby={ids.title}>
      <h2 id={ids.title}>Repair or breakdown</h2>
      <p className="small">{REPAIR_GUIDANCE}</p>
      {contact && (contact.phone || contact.email) && (
        <p className="small">
          Support:{' '}
          {contact.phone && <a href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{contact.phone}</a>}
          {contact.phone && contact.email && ' · '}
          {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
        </p>
      )}

      {canReport && (
        <form className="stack" onSubmit={submit} noValidate>
          <label htmlFor={ids.description}>
            What happened?
            <textarea
              id={ids.description}
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Where you are and what is wrong with the scooter"
            />
          </label>
          <label className="inline">
            <input type="checkbox" checked={selfArranged} onChange={(e) => setSelfArranged(e.target.checked)} />I
            arranged an emergency repair myself
          </label>
          {selfArranged && (
            <label htmlFor={ids.claimed}>
              Repair amount (LKR, optional)
              <input
                id={ids.claimed}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={claimed}
                onChange={(e) => setClaimed(e.target.value)}
                aria-describedby={ids.claimHint}
              />
              <span id={ids.claimHint} className="field-hint">
                Keep the receipt. Reimbursement is decided by an admin after review.
              </span>
            </label>
          )}
          <ErrorAlert error={problem ?? action.error} />
          {sent && (
            <div className="alert success" role="status">
              Your report has been sent. We will contact you about assistance.
            </div>
          )}
          <button type="submit" className="primary" disabled={action.busy} style={{ alignSelf: 'flex-start' }}>
            {action.busy ? 'Sending…' : 'Report a problem'}
          </button>
        </form>
      )}

      <ErrorAlert error={reports.error} />
      {reports.data && reports.data.length > 0 && (
        <ul className="repair-list" aria-label="Your reports">
          {reports.data.map((r) => (
            <li key={r.id}>
              <div className="row between">
                <span className={`badge ${REPAIR_STATUS_TONE[r.status]}`}>{REPAIR_STATUS_LABEL[r.status]}</span>
                <span className="muted small">{dateTime(r.reportedAt)}</span>
              </div>
              <p className="small">{r.description}</p>
              {r.selfArranged && (
                <p className="muted small">
                  You arranged the repair{r.claimedAmount != null && <> · claimed {money(r.claimedAmount)}</>}
                  {r.approvedAmount != null && <> · approved {money(r.approvedAmount)}</>}
                </p>
              )}
              {r.adminNote && <p className="small">Note from us: {r.adminNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
