import { date, money } from '../format';
import { isTransferMethod, PAYMENT_METHOD_LABEL } from '../transfers';
import type { Invoice } from '../types';
import { StatusBadge } from './ui';

const TITLE: Record<Invoice['kind'], string> = {
  FINAL: 'Final invoice',
  RENTAL: 'Rental invoice',
  SETTLEMENT: 'Return settlement',
};

export default function InvoiceView({ invoice }: { invoice: Invoice }) {
  // Final invoices take their status from the booking's payment (unless voided, as a closed viva demo rental's);
  // earlier ones kept their own.
  const status = invoice.kind === 'FINAL' && invoice.status !== 'VOID' ? invoice.paymentStatus : invoice.status;
  // A final invoice lists the rental charges, then any approved repair reimbursement (a negative line) after the
  // rental subtotal; its total is the adjusted final total.
  const credits = invoice.kind === 'FINAL' ? invoice.lines.filter((l) => l.amount < 0) : [];
  const charges = credits.length > 0 ? invoice.lines.filter((l) => l.amount >= 0) : invoice.lines;
  // Paid in cash at the counter: the cash received, any cash handed back, and what is still due either way.
  const cash = invoice.kind === 'FINAL' && invoice.paymentMethod === 'CASH';
  // Paid by QR or bank transfer: what an administrator approved as received, refunds sent, and any refund still due.
  const transfer = invoice.kind === 'FINAL' && isTransferMethod(invoice.paymentMethod);
  return (
    <article className="card stack invoice" aria-labelledby={`invoice-${invoice.id}`}>
      <div className="row between">
        <div>
          <h3 id={`invoice-${invoice.id}`}>
            {TITLE[invoice.kind]} {invoice.invoiceNumber}
          </h3>
          <div className="muted small">
            Issued {date(invoice.issuedAt)} · {invoice.customerName}
          </div>
        </div>
        {status && <StatusBadge status={status} />}
      </div>
      <div className="invoice__table">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{Number(l.quantity).toLocaleString('en-LK', { maximumFractionDigits: 2 })}</td>
              <td className="num">{money(l.unitPrice)}</td>
              <td className="num">{money(l.amount)}</td>
            </tr>
          ))}
          {credits.length > 0 && (
            <tr className="invoice__subtotal">
              <td colSpan={3}>Rental subtotal</td>
              <td className="num">{money(invoice.subtotal)}</td>
            </tr>
          )}
          {credits.map((l, i) => (
            <tr key={`credit-${i}`} className="invoice__credit">
              <td colSpan={3}>{l.description}</td>
              <td className="num">−{money(Math.abs(l.amount))}</td>
            </tr>
          ))}
          {invoice.tax > 0 && (
            <tr>
              <td colSpan={3}>Tax</td>
              <td className="num">{money(invoice.tax)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={3}>
              <strong>{invoice.total < 0 ? 'Refund due to customer' : credits.length > 0 ? 'Adjusted final total' : 'Total'}</strong>
            </td>
            <td className="num">
              <strong>{money(Math.abs(invoice.total))}</strong>
            </td>
          </tr>
          {transfer && (
            <>
              <tr className="invoice__cash">
                <td colSpan={3}>Already received</td>
                <td className="num">{money(invoice.amountReceived)}</td>
              </tr>
              {(invoice.amountRefunded ?? 0) > 0 && (
                <tr className="invoice__cash">
                  <td colSpan={3}>Refund completed</td>
                  <td className="num">−{money(invoice.amountRefunded)}</td>
                </tr>
              )}
              {invoice.refundDue != null && (
                <tr className="invoice__cash">
                  <td colSpan={3}>
                    <strong>Refund due (not yet refunded)</strong>
                  </td>
                  <td className="num">
                    <strong>{money(invoice.refundDue)}</strong>
                  </td>
                </tr>
              )}
            </>
          )}
          {!cash && invoice.balanceDue != null && (
            <tr>
              <td colSpan={3}>Balance still due</td>
              <td className="num">{money(invoice.balanceDue)}</td>
            </tr>
          )}
          {cash && (
            <>
              <tr className="invoice__cash">
                <td colSpan={3}>Cash already received</td>
                <td className="num">{money(invoice.cashReceived)}</td>
              </tr>
              {(invoice.cashRefunded ?? 0) > 0 && (
                <tr className="invoice__cash">
                  <td colSpan={3}>Cash handed back</td>
                  <td className="num">−{money(invoice.cashRefunded)}</td>
                </tr>
              )}
              {invoice.balanceDue != null && (
                <tr className="invoice__cash">
                  <td colSpan={3}>
                    <strong>Cash balance due</strong>
                  </td>
                  <td className="num">
                    <strong>{money(invoice.balanceDue)}</strong>
                  </td>
                </tr>
              )}
              {invoice.refundDue != null && (
                <tr className="invoice__cash">
                  <td colSpan={3}>
                    <strong>Cash refund due</strong>
                  </td>
                  <td className="num">
                    <strong>{money(invoice.refundDue)}</strong>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      </div>
      {cash && <p className="muted small">Payment method: Cash at the rental counter.</p>}
      {transfer && invoice.paymentMethod && (
        <p className="muted small">
          Payment method: {PAYMENT_METHOD_LABEL[invoice.paymentMethod]}, verified by an administrator.
        </p>
      )}
    </article>
  );
}
