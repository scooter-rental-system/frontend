import { ChangeEvent, FormEvent, useEffect, useId, useState } from 'react';
import { api, postForm } from '../api';
import { dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import {
  addPhotos, CLAIM_NOTE, fileSize, MAX_PHOTOS, PHOTO_ACCEPT, PHOTO_HINT, REPAIR_GUIDANCE, REPAIR_STATUS_LABEL,
  REPAIR_STATUS_TONE, reimbursementNote, repairReportProblem,
} from '../repairs';
import type { RepairReport, SupportContact } from '../types';
import { RepairPhotos } from './RepairPhotos';
import { ErrorAlert } from './ui';

/**
 * The rider's repair/breakdown reports on their own booking: a report form while the rental is in progress (with up
 * to three optional photos), and the status of earlier reports. Support contact details appear only when the server
 * has them configured.
 */
export function RepairPanel({ bookingId, canReport }: { bookingId: string; canReport: boolean }) {
  const ids = { title: useId(), description: useId(), claimed: useId(), claimHint: useId(), photos: useId(), photoHint: useId() };
  const reports = useLoad(() => api.get<RepairReport[]>(`/bookings/${encodeURIComponent(bookingId)}/repairs`), [bookingId]);
  const support = useLoad(() => api.get<SupportContact>('/support/contact'), []);
  const [description, setDescription] = useState('');
  const [selfArranged, setSelfArranged] = useState(false);
  const [claimed, setClaimed] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoIssue, setPhotoIssue] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const action = useAction();

  if (!canReport && (reports.data?.length ?? 0) === 0) return null;

  const choosePhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const result = addPhotos(photos, Array.from(e.target.files ?? []));
    setPhotos(result.photos);
    setPhotoIssue(result.problem);
    e.target.value = ''; // the same file can be chosen again after removing it
  };

  const removePhoto = (index: number) => {
    setPhotos((list) => list.filter((_, i) => i !== index));
    setPhotoIssue(null);
  };

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
    const created = await action.run(() => {
      if (photos.length === 0) {
        return api.post<RepairReport>(`/bookings/${encodeURIComponent(bookingId)}/repairs`, body);
      }
      // The report as a JSON part and each photo as a file part; the server checks every photo again.
      const form = new FormData();
      form.append('report', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      photos.forEach((p) => form.append('photos', p, p.name));
      return postForm<RepairReport>(`/bookings/${encodeURIComponent(bookingId)}/repairs`, form);
    });
    if (created) {
      setSent(true);
      setDescription('');
      setSelfArranged(false);
      setClaimed('');
      setPhotos([]);
      setPhotoIssue(null);
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
          <div className="repair-photo-picker">
            <label htmlFor={ids.photos}>Photos (optional)</label>
            <span id={ids.photoHint} className="field-hint">
              {PHOTO_HINT} JPEG, PNG or WebP, up to {MAX_PHOTOS} photos, 5 MB each.
            </span>
            <input
              id={ids.photos}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={choosePhotos}
              disabled={action.busy || photos.length >= MAX_PHOTOS}
              aria-describedby={ids.photoHint}
            />
            {photos.length > 0 && (
              <ul className="repair-photo-picker__list" aria-label="Selected photos">
                {photos.map((p, i) => (
                  <SelectedPhoto key={`${p.name}-${i}`} file={p} onRemove={() => removePhoto(i)} disabled={action.busy} />
                ))}
              </ul>
            )}
            {photoIssue && (
              <span className="field-error" role="alert">
                {photoIssue}
              </span>
            )}
          </div>
          <ErrorAlert error={problem ?? action.error} />
          {sent && (
            <div className="alert success" role="status">
              Your report has been sent. We will contact you about assistance.
            </div>
          )}
          <button type="submit" className="primary" disabled={action.busy} style={{ alignSelf: 'flex-start' }}>
            {action.busy ? (photos.length > 0 ? 'Uploading…' : 'Sending…') : 'Report a problem'}
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
                  You arranged the repair{r.claimedAmount != null && <> · you claimed {money(r.claimedAmount)}</>}
                  {r.approvedAmount != null && (
                    <>
                      {' '}
                      · approved reimbursement {money(r.approvedAmount)}. {reimbursementNote(r.status, r.approvedAmount)}
                    </>
                  )}
                  {r.claimedAmount != null && r.approvedAmount == null && <> · {CLAIM_NOTE}</>}
                </p>
              )}
              <RepairPhotos reportId={r.id} photos={r.photos ?? []} />
              {r.adminNote && <p className="small">Note from us: {r.adminNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A photo chosen for the report: a small preview, its name and size, and a way to remove it before sending. */
function SelectedPhoto({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li>
      {url && <img src={url} alt="" />}
      <span className="small">
        {file.name} · {fileSize(file.size)}
      </span>
      <button type="button" className="small" onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`}>
        Remove
      </button>
    </li>
  );
}
