import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { cashConfirmPath, invoiceReimbursement } from '../cash';
import { dateTime, money } from '../format';
import { useAction, useLoad } from '../hooks';
import { checkoutPath } from '../routes';
import {
  isTransferMethod,
  manualRefundAction,
  manualRefundPath,
  offeredTransfers,
  PAYMENT_METHOD_LABEL,
  PAYMENT_OPTIONS_PATH,
  RECEIPT_WAITING,
  TRANSFER_LABEL,
  TRANSFER_NAME,
  transferStep,
  type TransferMethod,
} from '../transfers';
import type { AdminReceipt, Booking, Invoice, PaymentOptions, ReceiptSummary } from '../types';
import { useConfirm } from '../useConfirm';
import { ReceiptReview } from './ReceiptReview';
import { ReceiptUpload, TransferInstructions } from './TransferPay';
import { DetailRow, ErrorAlert } from './ui';

/**
 * QR payments and bank transfers on a booking. The customer sees what is due and how to pay it (the initial
 * charge at checkout; at the end of the rental the exact balance, also on a booking first paid in cash), uploads
 * the receipt and then waits for verification. An administrator reviews a waiting receipt here, and records a
 * refund made from the business account. Nothing here marks money as received without an administrator.
 */
export function TransferPanel({
  booking: b,
  invoice,
  admin,
  onChanged,
}: {
  booking: Booking;
  invoice?: Invoice;
  admin: boolean;
  onChanged: () => void;
}) {
  const options = useLoad(() => api.get<PaymentOptions>(PAYMENT_OPTIONS_PATH));
  const p = b.payment;
  const step = transferStep(b);
  const refund = manualRefundAction(b, admin);
  const refundDue = p != null && isTransferMethod(p.method) && p.refundDue != null;
  if (!p || (!step && !refundDue)) return null;
  // A cash booking is shown here only to offer a transfer for its final balance, when one is enabled.
  const offered = offeredTransfers(options.data);
  if (p.method === 'CASH' && step?.kind === 'balance' && (admin || offered.length === 0)) return null;

  const reimbursement = invoice ? invoiceReimbursement(invoice) : 0;
  const settling = b.status === 'ACTIVE' && b.endedAt != null;

  return (
    <section className="card stack action-panel" aria-labelledby="transfer-title">
      <div className="checkout-task__head">
        <h2 id="transfer-title">
          {step?.kind === 'waiting'
            ? 'Receipt waiting for verification'
            : refundDue
              ? 'Refund due'
              : step?.kind === 'balance'
                ? p.method === 'CASH'
                  ? 'Pay the balance by transfer instead'
                  : 'Final balance due'
                : `${PAYMENT_METHOD_LABEL[p.method]} payment`}
        </h2>
        <span className="badge amber">{admin ? 'Action needed' : 'Bank or QR transfer'}</span>
      </div>

      {settling && (
        <dl className="small cash-bill">
          {invoice && <DetailRow label="Rental subtotal">{money(invoice.subtotal)}</DetailRow>}
          {reimbursement > 0 && <DetailRow label="Approved repair reimbursement">−{money(reimbursement)}</DetailRow>}
          <DetailRow label="Adjusted final total">{money(b.pendingTotalCost)}</DetailRow>
          <DetailRow label="Already received">{money(p.amount)}</DetailRow>
          {p.balanceDue != null && (
            <DetailRow label="Balance due">
              <strong>{money(p.balanceDue)}</strong>
            </DetailRow>
          )}
          {p.refundDue != null && (
            <DetailRow label="Refund due">
              <strong>{money(p.refundDue)}</strong>
            </DetailRow>
          )}
        </dl>
      )}

      {step?.kind === 'waiting' && (
        <>
          <div className="alert info" role="status">
            {RECEIPT_WAITING}
          </div>
          <p className="small">
            {TRANSFER_LABEL[step.receipt.method]} of <strong>{money(step.receipt.amount)}</strong> submitted{' '}
            {dateTime(step.receipt.submittedAt)}
            {step.receipt.transferReference && ` · reference ${step.receipt.transferReference}`}.
          </p>
          {admin && (
            <ReceiptReview
              receipt={adminReceipt(b, step.receipt)}
              onChanged={onChanged}
            />
          )}
        </>
      )}

      {step && step.kind !== 'waiting' && step.rejected && (
        <div className="alert" role="alert">
          Your last receipt was not accepted: {step.rejected.rejectionReason}. Please upload a new receipt.
        </div>
      )}

      {step?.kind === 'initial' &&
        (admin ? (
          <p className="small">Waiting for the customer to transfer {money(step.amount)} and upload the receipt.</p>
        ) : (
          <p className="small">
            Transfer {money(step.amount)} by {TRANSFER_NAME[p.method as TransferMethod]} and upload the receipt.{' '}
            <Link to={checkoutPath(b.id)}>Open payment instructions</Link>
          </p>
        ))}

      {step?.kind === 'balance' &&
        (admin ? (
          <AdminBalance booking={b} amount={step.amount} onChanged={onChanged} />
        ) : (
          <BalanceTransfer booking={b} amount={step.amount} options={options.data} onChanged={onChanged} />
        ))}

      {refundDue &&
        (refund ? (
          <ManualRefund booking={b} action={refund} onChanged={onChanged} />
        ) : (
          <p className="small">
            A refund of <strong>{money(p.refundDue)}</strong> is due to you. Our team sends it from the business
            account and confirms it here.
          </p>
        ))}
    </section>
  );
}

/** The customer pays the exact final balance by QR or bank transfer and uploads the receipt. */
function BalanceTransfer({
  booking: b,
  amount,
  options,
  onChanged,
}: {
  booking: Booking;
  amount: number;
  options: PaymentOptions | null;
  onChanged: () => void;
}) {
  const offered = offeredTransfers(options);
  const [chosen, setChosen] = useState<TransferMethod | null>(null);
  const method = chosen ?? offered[0] ?? null;
  if (!options) return null;
  if (!method) {
    return <p className="small">Pay the balance of {money(amount)} at the rental counter.</p>;
  }
  return (
    <div className="stack">
      <fieldset className="payment-methods">
        <legend>Pay the balance by</legend>
        {offered.map((m) => (
          <label key={m} className={`payment-method${method === m ? ' is-selected' : ''}`}>
            <input type="radio" name="balance-method" value={m} checked={method === m} onChange={() => setChosen(m)} />
            {TRANSFER_LABEL[m]}
          </label>
        ))}
      </fieldset>
      <TransferInstructions method={method} options={options} amount={amount} reference={b.reference} />
      <ReceiptUpload booking={b} method={method} sendMethod onSubmitted={onChanged} />
      {b.payment?.method !== 'CASH' && <p className="muted small">You can also pay the balance in cash at the rental counter.</p>}
    </div>
  );
}

/** A transfer booking's balance with no receipt waiting: the admin may record cash paid at the counter instead. */
function AdminBalance({ booking: b, amount, onChanged }: { booking: Booking; amount: number; onChanged: () => void }) {
  const record = useAction();
  const { confirm, dialog } = useConfirm();
  const doCash = async () => {
    const ok = await confirm({
      title: 'Confirm final cash received?',
      message: `Confirm only after you have received the remaining ${money(amount)} in cash at the counter. The rental is then completed.`,
      confirmLabel: 'Confirm final cash received',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    if (await record.run(() => api.post<Booking>(cashConfirmPath(b.id, 'balance'), { amount }))) onChanged();
  };
  return (
    <div className="stack">
      {dialog}
      <p className="small">
        Waiting for the customer to transfer {money(amount)} and upload the receipt. If they pay in cash at the counter
        instead, record it here.
      </p>
      <ErrorAlert error={record.error} />
      <div>
        <button onClick={doCash} disabled={record.busy}>
          {record.busy ? 'Recording…' : 'Confirm final cash received'}
        </button>
      </div>
    </div>
  );
}

/** "Confirm manual refund completed", with an optional refund reference and note. */
function ManualRefund({
  booking: b,
  action,
  onChanged,
}: {
  booking: Booking;
  action: NonNullable<ReturnType<typeof manualRefundAction>>;
  onChanged: () => void;
}) {
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const record = useAction();
  const { confirm, dialog } = useConfirm();
  const doRefund = async () => {
    const ok = await confirm({
      title: action.title,
      message: action.message,
      confirmLabel: action.label,
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    const done = await record.run(() =>
      api.post<Booking>(manualRefundPath(b.id), {
        amount: action.amount,
        reference: reference.trim() || null,
        note: note.trim() || null,
      }),
    );
    if (done) onChanged();
  };
  return (
    <div className="stack">
      {dialog}
      <p className="small">
        Refund due: <strong>{money(action.amount)}</strong> (not yet refunded). Send it from the business account, then
        record it.
      </p>
      <label>
        Refund reference (optional)
        <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
      </label>
      <label>
        Note (optional)
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <ErrorAlert error={record.error} />
      <div>
        <button className="primary" onClick={doRefund} disabled={record.busy}>
          {record.busy ? 'Recording…' : action.label}
        </button>
      </div>
    </div>
  );
}

/** The admin view of a waiting receipt, from the booking this page already loaded. */
function adminReceipt(b: Booking, r: ReceiptSummary): AdminReceipt {
  const p = b.payment;
  const amountDue = r.kind === 'INITIAL' ? (b.status === 'PENDING' ? (p?.amount ?? null) : null) : (p?.balanceDue ?? null);
  return {
    ...r,
    bookingId: b.id,
    bookingReference: b.reference,
    bookingStatus: b.status,
    customerName: b.customer.fullName,
    customerEmail: b.customer.email,
    amountDue,
    reviewedBy: null,
  };
}
