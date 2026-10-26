import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { filterPayments, initials, PAYMENT_FILTERS, PAYMENT_TONE, paymentCounts, type PaymentFilter } from '../../admin';
import InvoiceView from '../../components/InvoiceView';
import { Empty, ErrorAlert, Loading, StatusBadge } from '../../components/ui';
import { date, dateTime, humanize, money } from '../../format';
import { useAction, useLoad } from '../../hooks';
import { paymentSetup, PAYMENTS_UNAVAILABLE, stripeMode } from '../../payments';
import { adminBookingPath } from '../../routes';
import { loadPaymentConfig } from '../../stripe';
import type { Invoice, Payment } from '../../types';

/** The card payment provider as the backend reports it (GET /api/payments/config); no keys are shown. */
function PaymentProviderStatus() {
  const config = useLoad(loadPaymentConfig);
  if (config.loading) return null;
  const setup = paymentSetup(config.data);
  if (!setup.ready) {
    return (
      <div className="alert small" role="status">
        {PAYMENTS_UNAVAILABLE} No payment provider is configured, so customers cannot pay for bookings.
      </div>
    );
  }
  const mode = stripeMode(setup.publishableKey);
  return (
    <div className="alert info small">
      Card payments: <strong>Stripe</strong>
      {mode && <> ({mode === 'test' ? 'test mode: no real money moves' : 'live mode'})</>}, in {setup.currency}. Card
      details are entered on Stripe&apos;s secure form and never reach this system.
    </div>
  );
}

export default function Billing() {
  const [tab, setTab] = useState<'payments' | 'invoices'>('payments');
  const [filter, setFilter] = useState<PaymentFilter>('ALL');
  const payments = useLoad(() => api.get<Payment[]>('/admin/payments'));
  const invoices = useLoad(() => api.get<Invoice[]>('/admin/invoices'));
  const [open, setOpen] = useState<Invoice | null>(null);
  const action = useAction();

  const viewInvoice = async (id: string) => {
    const inv = await action.run(() => api.get<Invoice>(`/invoices/${id}`));
    if (inv) setOpen(inv);
  };

  const counts = paymentCounts(payments.data ?? []);
  const shown = filterPayments(payments.data ?? [], filter);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <span className="eyebrow">Finance</span>
          <h1>
            Payments <span className="accent-text">&amp; billing</span>
          </h1>
          <p className="muted">Card payments taken through Stripe, and the invoices issued for each booking.</p>
        </div>
      </div>
      <PaymentProviderStatus />

      <div className="segmented" role="group" aria-label="Show">
        <button type="button" aria-pressed={tab === 'payments'} onClick={() => setTab('payments')}>
          Payments
        </button>
        <button type="button" aria-pressed={tab === 'invoices'} onClick={() => setTab('invoices')}>
          Invoices
        </button>
      </div>
      <ErrorAlert error={payments.error ?? invoices.error ?? action.error} />
      {open && (
        <div className="stack">
          <InvoiceView invoice={open} />
          <div>
            <button onClick={() => setOpen(null)}>Close invoice</button>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <section className="stack" aria-labelledby="payments-title">
          <h2 id="payments-title" className="sr-only">
            Payments
          </h2>
          <div className="segmented" role="group" aria-label="Payment status">
            {PAYMENT_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="small"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label} <span className="count">({counts[f.value]})</span>
              </button>
            ))}
          </div>
          {payments.loading && <Loading />}
          {payments.data && shown.length === 0 && <Empty>No payments with this status.</Empty>}
          {shown.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Booking</th>
                    <th scope="col">Paid</th>
                    <th scope="col">Method</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Customer">
                        <div className="cell-person">
                          <span className="avatar" aria-hidden>
                            {initials(p.customerName)}
                          </span>
                          <strong>{p.customerName ?? '—'}</strong>
                        </div>
                      </td>
                      <td data-label="Booking">
                        <Link to={adminBookingPath(p.bookingId)}>{p.bookingReference}</Link>
                      </td>
                      <td data-label="Paid">{p.paidAt ? dateTime(p.paidAt) : <span className="muted">not paid</span>}</td>
                      <td data-label="Method">
                        {p.method.toLowerCase()}
                        {p.cardLast4 && <span className="cell-sub">card ending {p.cardLast4}</span>}
                      </td>
                      <td data-label="Status">
                        <span className="row">
                          <span className={`badge ${PAYMENT_TONE[p.status]}`}>{humanize(p.status)}</span>
                          {p.balanceDue != null && <span className="badge red">Due {money(p.balanceDue)}</span>}
                        </span>
                        {p.failureReason && <span className="cell-sub">{p.failureReason}</span>}
                      </td>
                      <td data-label="Amount" className="num">
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span>
                  Showing {shown.length} of {payments.data?.length ?? 0} payments
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'invoices' && (
        <section className="stack" aria-labelledby="invoices-title">
          <h2 id="invoices-title" className="sr-only">
            Invoices
          </h2>
          {invoices.loading && <Loading />}
          {invoices.data?.length === 0 && <Empty>No invoices yet.</Empty>}
          {invoices.data && invoices.data.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Issued</th>
                    <th scope="col">Booking</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Total
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((inv) => (
                    <tr key={inv.id}>
                      <td data-label="Invoice">
                        <strong>{inv.invoiceNumber}</strong>
                      </td>
                      <td data-label="Issued">{date(inv.issuedAt)}</td>
                      <td data-label="Booking">
                        <Link to={adminBookingPath(inv.bookingId)}>{inv.bookingReference}</Link>
                      </td>
                      <td data-label="Customer">{inv.customerName}</td>
                      <td data-label="Kind">{inv.kind.toLowerCase()}</td>
                      <td data-label="Status">
                        {(inv.kind === 'FINAL' ? inv.paymentStatus : inv.status) && (
                          <StatusBadge status={(inv.kind === 'FINAL' ? inv.paymentStatus : inv.status)!} />
                        )}
                      </td>
                      <td data-label="Total" className="num">
                        {money(inv.total)}
                      </td>
                      <td className="actions">
                        <div className="row">
                          <button className="small" onClick={() => viewInvoice(inv.id)}>
                            View<span className="sr-only"> {inv.invoiceNumber}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
