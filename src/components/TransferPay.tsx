import { useState } from 'react';
import { postForm } from '../api';
import { money } from '../format';
import { useAction } from '../hooks';
import {
  QR_IMAGE_PATH,
  RECEIPT_ACCEPT,
  RECEIPT_HINT,
  receiptProblem,
  receiptsPath,
  referenceProblem,
  TRANSFER_LABEL,
  TRANSFER_OUTSIDE_NOTE,
  TRANSFER_REFERENCE_NOTE,
  type TransferMethod,
} from '../transfers';
import type { Booking, PaymentOptions } from '../types';
import { AuthImage } from './AuthImage';
import { ErrorAlert } from './ui';

/** Copies a value to the clipboard and says so; nothing happens where the browser does not allow it. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="small copy-button" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * How to pay by QR or bank transfer: the details an administrator configured, the exact amount and the booking
 * reference to use. The customer pays in their own app; nothing here moves money.
 */
export function TransferInstructions({
  method,
  options,
  amount,
  reference,
}: {
  method: TransferMethod;
  options: PaymentOptions;
  amount: number;
  reference: string;
}) {
  const qr = options.qr;
  const bank = options.bank;
  return (
    <div className="stack transfer-instructions">
      {method === 'QR_TRANSFER' && qr && (
        <div className="transfer-qr">
          <AuthImage path={QR_IMAGE_PATH} alt="QR code to scan" className="transfer-qr__image" />
          <div className="stack">
            <p>
              Pay to <strong>{qr.displayName}</strong>
            </p>
            {qr.instructions && <p className="small">{qr.instructions}</p>}
          </div>
        </div>
      )}
      {method === 'BANK_TRANSFER' && bank && (
        <dl className="transfer-details small">
          <div>
            <dt>Bank</dt>
            <dd>{bank.bankName}</dd>
          </div>
          <div>
            <dt>Account holder</dt>
            <dd>{bank.accountHolder}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>
              <strong className="num">{bank.accountNumber}</strong>{' '}
              <CopyButton value={bank.accountNumber} label="account number" />
            </dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>
              {bank.branch}
              {bank.branchCode && <span className="muted"> (code {bank.branchCode})</span>}
            </dd>
          </div>
          {bank.instructions && (
            <div>
              <dt>Instructions</dt>
              <dd>{bank.instructions}</dd>
            </div>
          )}
        </dl>
      )}
      <dl className="transfer-details small">
        <div>
          <dt>Amount to transfer</dt>
          <dd>
            <strong className="price">{money(amount)}</strong>
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            <strong>{reference}</strong> <CopyButton value={reference} label="booking reference" />
          </dd>
        </div>
      </dl>
      <div className="alert info" role="note">
        <strong>{TRANSFER_REFERENCE_NOTE}</strong> {TRANSFER_OUTSIDE_NOTE}
      </div>
    </div>
  );
}

/**
 * The receipt of a transfer the customer made. Required for QR and bank transfer; checked here and again by the
 * server. Submitting it records nothing as paid: an administrator verifies it. {@code prepare} runs first (for
 * example to record the chosen method) and stops the upload when it fails.
 */
export function ReceiptUpload({
  booking: b,
  method,
  sendMethod,
  prepare,
  onSubmitted,
}: {
  booking: Booking;
  method: TransferMethod;
  sendMethod: boolean;
  prepare?: () => Promise<boolean>;
  onSubmitted: (b: Booking) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const submit = useAction();

  const choose = (f: File | null) => {
    setFile(f);
    setProblem(f ? receiptProblem(f) : null);
  };

  const doSubmit = async () => {
    const issue = receiptProblem(file) ?? referenceProblem(reference);
    setProblem(issue);
    if (issue || !file) return;
    if (prepare && !(await prepare())) return;
    const form = new FormData();
    form.append('receipt', file);
    if (sendMethod) form.append('method', method);
    if (reference.trim()) form.append('reference', reference.trim());
    const res = await submit.run(() => postForm<Booking>(receiptsPath(b.id), form));
    if (res) onSubmitted(res);
  };

  return (
    <div className="stack receipt-upload">
      <label>
        Payment receipt ({TRANSFER_LABEL[method]})
        <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      </label>
      <p className="muted small">{RECEIPT_HINT}</p>
      <label>
        Transaction reference (optional)
        <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
      </label>
      {problem && (
        <div className="alert" role="alert">
          {problem}
        </div>
      )}
      <ErrorAlert error={submit.error} />
      <button className="primary checkout-task__action" disabled={!file || !!problem || submit.busy} onClick={doSubmit}>
        {submit.busy ? 'Submitting…' : 'Submit receipt'}
      </button>
    </div>
  );
}
