// Run with `npm test` (Node's built-in test runner).
// Workflow order (final audit): the rental cannot be ended while a self-arranged repair report is unresolved (the
// backend refuses; the page disables End rental and says why), and a final invoice never shows a green success while
// a balance or a refund is still due. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { UNRESOLVED_REPAIRS_ADMIN, UNRESOLVED_REPAIRS_CUSTOMER, unresolvedReimbursements } from './repairs.ts';
import { invoiceStatus } from './transfers.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const detail = read('pages', 'BookingDetail.tsx');
const ui = read('components', 'ui.tsx');
const billing = read('pages', 'admin', 'Billing.tsx');

describe('unresolved repairs hold back the final bill', () => {
  it('counts only self-arranged reports that are not resolved', () => {
    const reports = [
      { selfArranged: true, status: 'REPORTED' },
      { selfArranged: true, status: 'UNDER_REVIEW' },
      { selfArranged: true, status: 'RESOLVED' },
      { selfArranged: false, status: 'ASSISTANCE_ARRANGED' },
    ];
    assert.equal(unresolvedReimbursements(reports).length, 2);
    assert.equal(unresolvedReimbursements([]).length, 0);
  });

  it('disables End rental and explains the order to follow', () => {
    assert.match(detail, /const openRepairs = unresolvedReimbursements\(repairs\.data \?\? \[\]\);/);
    assert.match(detail, /blockedReason=\{openRepairs\.length > 0 \? RETURN_BLOCKED_BY_REPAIRS : null\}/);
    const returnPanel = read('components', 'ReturnPanel.tsx');
    assert.match(returnPanel, /\{blockedReason && \(\s*<div className="alert warning" role="status">\s*\{blockedReason\}/);
    assert.match(returnPanel, /<ErrorAlert error=\{end\.error\} \/>/);
    // A reload after the action keeps the page, so a refusal from the backend is not lost.
    assert.match(detail, /if \(booking\.loading && !booking\.data\) return <Loading \/>;/);
    assert.match(read('components', 'ReturnPanel.tsx'), /disabled=\{end\.busy \|\| blocked \|\| \(needsReading && !reading\.trim\(\)\)\}/);
    assert.match(detail, /\{b\.stage === 'IN_PROGRESS' && !demoRental && openRepairs\.length > 0 && \(/);
    assert.match(detail, /\{inAdmin \? UNRESOLVED_REPAIRS_ADMIN : UNRESOLVED_REPAIRS_CUSTOMER\}/);
    assert.match(detail, /<Link to="\/admin\/repairs">Open Repairs<\/Link>/);
    assert.match(UNRESOLVED_REPAIRS_ADMIN, /^This rental has unresolved repair reports\. Resolve them before calculating the final bill/);
    assert.match(UNRESOLVED_REPAIRS_ADMIN, /set it to Resolved and save, then come back and end the rental/);
    assert.doesNotMatch(UNRESOLVED_REPAIRS_CUSTOMER, /claimed amount will be/i);
  });

  it('reloads the reports with the booking', () => {
    assert.match(detail, /const refresh = \(\) => \{\s*booking\.reload\(\);\s*invoices\.reload\(\);\s*repairs\.reload\(\);/);
  });
});

describe('invoice status', () => {
  const final = (over) => ({ kind: 'FINAL', status: null, paymentStatus: 'SUCCESS', balanceDue: null, refundDue: null, ...over });

  it('shows a balance or refund still due instead of the first charge succeeding', () => {
    assert.equal(invoiceStatus(final({ balanceDue: 6250 })), 'BALANCE_DUE');
    assert.equal(invoiceStatus(final({ refundDue: 100 })), 'REFUND_DUE');
    assert.equal(invoiceStatus(final({})), 'SUCCESS');
    assert.equal(invoiceStatus(final({ paymentStatus: 'REFUNDED' })), 'REFUNDED');
    assert.equal(invoiceStatus(final({ status: 'VOID', balanceDue: 10 })), 'VOID');
    assert.equal(invoiceStatus({ kind: 'RENTAL', status: 'PAID', paymentStatus: 'SUCCESS', balanceDue: null, refundDue: null }), 'PAID');
    assert.match(ui, /BALANCE_DUE: 'amber',\s*REFUND_DUE: 'amber',/);
    assert.match(billing, /\{invoiceStatus\(inv\) && <StatusBadge status=\{invoiceStatus\(inv\)!\} \/>\}/);
  });
});
