import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { dateTime, money } from '../format';
import { useAction } from '../hooks';
import { adminBookingPath } from '../routes';
import {
  approveReceiptPath,
  receiptApproval,
  receiptImagePath,
  REJECTION_REASONS,
  rejectReceiptPath,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  TRANSFER_LABEL,
} from '../transfers';
import type { AdminReceipt } from '../types';
import { useConfirm } from '../useConfirm';
import { AuthImage } from './AuthImage';
import { DetailRow, ErrorAlert } from './ui';

/**
 * One QR or bank transfer receipt for an administrator: the receipt image, the expected amount and reference, and
 * while it waits for verification the two actions: approve (after checking the business account, with a
 * confirmation) or reject with a reason. Each action names this receipt and its exact amount.
 */
export function ReceiptReview({ receipt: r, onChanged }: { receipt: AdminReceipt; onChanged: () => void }) {
  const act = useAction();
  const { confirm, dialog } = useConfirm();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approval = receiptApproval(r);
  const waiting = r.status === 'PENDING_VERIFICATION';

  const doApprove = async () => {
    if (!approval) return;
    const ok = await confirm({
      title: approval.title,
      message: approval.message,
      confirmLabel: approval.label,
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (await act.run(() => api.post<AdminReceipt>(approveReceiptPath(r.id), { amount: r.amount }))) onChanged();
  };

  const doReject = async () => {
    const why = reason.trim();
    if (!why) return;
    const ok = await confirm({
      title: 'Reject this receipt?',
      message: `The customer is told: "${why}". Nothing is paid and they can upload a new receipt.`,
      confirmLabel: 'Reject receipt',
      cancelLabel: 'Keep reviewing',
      destructive: true,
    });
    if (!ok) return;
    if (await act.run(() => api.post<AdminReceipt>(rejectReceiptPath(r.id), { reason: why }))) {
      setRejecting(false);
      setReason('');
      onChanged();
    }
  };

  return (
    <article className="card stack receipt-review" aria-label={`Receipt for ${r.bookingReference}`}>
      {dialog}
      <div className="checkout-task__head">
        <h3>
          <Link to={adminBookingPath(r.bookingId)}>{r.bookingReference}</Link> ·{' '}
          {r.kind === 'INITIAL' ? 'Initial payment' : 'Final payment'}
        </h3>
        <span className={`badge ${RECEIPT_STATUS_TONE[r.status]}`}>{RECEIPT_STATUS_LABEL[r.status]}</span>
      </div>
      <div className="receipt-review__body">
        <AuthImage path={receiptImagePath(r.id)} alt={`Receipt for ${r.bookingReference}`} className="receipt-review__image" />
        <dl className="small">
          <DetailRow label="Customer">
            {r.customerName} <span className="muted">({r.customerEmail})</span>
          </DetailRow>
          <DetailRow label="Method">{TRANSFER_LABEL[r.method]}</DetailRow>
          <DetailRow label="Expected amount">
            <strong>{money(r.amount)}</strong>
            {waiting && r.amountDue !== r.amount && (
              <span className="badge red"> The booking now expects {r.amountDue == null ? 'nothing' : money(r.amountDue)}</span>
            )}
          </DetailRow>
          <DetailRow label="Transaction reference">{r.transferReference ?? <span className="muted">not given</span>}</DetailRow>
          <DetailRow label="Submitted">{dateTime(r.submittedAt)}</DetailRow>
          {r.reviewedAt && (
            <DetailRow label={r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Closed'}>
              {dateTime(r.reviewedAt)}
              {r.reviewedBy && ` by ${r.reviewedBy}`}
            </DetailRow>
          )}
          {r.rejectionReason && <DetailRow label="Reason">{r.rejectionReason}</DetailRow>}
        </dl>
      </div>
      <ErrorAlert error={act.error} />
      {waiting && (
        <div className="stack">
          <p className="muted small">
            Check the business account for {money(r.amount)} with reference {r.bookingReference} before approving.
          </p>
          <div className="row">
            {approval && (
              <button className="primary" onClick={doApprove} disabled={act.busy}>
                {act.busy ? 'Saving…' : approval.label}
              </button>
            )}
            <button className="danger" onClick={() => setRejecting(!rejecting)} disabled={act.busy}>
              Reject payment
            </button>
          </div>
          {rejecting && (
            <div className="stack">
              <div className="row" role="group" aria-label="Common reasons">
                {REJECTION_REASONS.map((x) => (
                  <button key={x} type="button" className="small" aria-pressed={reason === x} onClick={() => setReason(x)}>
                    {x}
                  </button>
                ))}
              </div>
              <label>
                Reason shown to the customer
                <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div>
                <button className="danger" onClick={doReject} disabled={!reason.trim() || act.busy}>
                  Reject receipt
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
