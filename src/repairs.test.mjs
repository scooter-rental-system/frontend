// Run with `npm test` (Node's built-in test runner).
// Repair/breakdown reports (backend BE-039) and the admin GPS history of one rental (BE-040). Source checks are
// CRLF-safe; nothing here simulates GPS or payments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN_NAV } from './admin.ts';
import {
  REPAIR_GUIDANCE,
  REPAIR_STATUS_LABEL,
  REPAIR_STATUSES,
  repairReportProblem,
  repairReviewBody,
  RESOLVE_TO_BILL,
  savedReviewMessage,
} from './repairs.ts';
import { SESSION_ENDED_MESSAGE } from './authNotice.ts';
import { adminGpsHistoryPath } from './routes.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('repair report rules', () => {
  it('explains what to do in the agreed words', () => {
    assert.equal(
      REPAIR_GUIDANCE,
      'If a breakdown or repair issue occurs, report it immediately. We can arrange assistance/mechanic support. If you arrange an emergency repair yourself, reimbursement is subject to admin review and approval. Keep the receipt/proof and repair details.',
    );
  });

  it('uses the four backend statuses', () => {
    assert.deepEqual(REPAIR_STATUSES, ['REPORTED', 'ASSISTANCE_ARRANGED', 'UNDER_REVIEW', 'RESOLVED']);
    assert.equal(REPAIR_STATUS_LABEL.ASSISTANCE_ARRANGED, 'Assistance arranged');
  });

  it('needs a description and a non-negative amount when one is given', () => {
    assert.equal(repairReportProblem('Flat tyre', false, ''), null);
    assert.equal(repairReportProblem('Fixed it myself', true, '1800.50'), null);
    assert.equal(repairReportProblem('Fixed it myself', true, ''), null);
    assert.match(repairReportProblem('  ', false, ''), /Describe/);
    assert.match(repairReportProblem('x', true, '-5'), /number/);
    assert.match(repairReportProblem('x', true, 'abc'), /number/);
    assert.match(repairReportProblem('x'.repeat(2001), false, ''), /2000/);
  });
});

describe('customer repair panel', () => {
  const panel = read('components', 'RepairPanel.tsx');
  const detail = read('pages', 'BookingDetail.tsx');

  it('is shown to the rider only, with the form only while the rental is in progress', () => {
    assert.match(detail, /\{isOwner && <RepairPanel bookingId=\{b\.id\} canReport=\{b\.stage === 'IN_PROGRESS'\} \/>\}/);
    assert.match(panel, /\{canReport && \(\s*<form/);
  });

  it('posts to the booking repair endpoint and sends a claim only for a self-arranged repair', () => {
    assert.match(panel, /api\.post<RepairReport>\(`\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/repairs`, body\)/);
    assert.match(panel, /claimedAmount: selfArranged && claimed\.trim\(\) !== '' \? Number\(claimed\) : null/);
  });

  it('shows the support contact only when the server has one configured, and invents none', () => {
    assert.match(panel, /api\.get<SupportContact>\('\/support\/contact'\)/);
    assert.match(panel, /\{contact && \(contact\.phone \|\| contact\.email\) && \(/);
    assert.doesNotMatch(panel, /\+94\s?\d|07\d{8}|@scooterrentkandy/);
  });

  it('labels its fields and announces success', () => {
    assert.match(panel, /What happened\?/);
    assert.match(panel, /I\s+arranged an emergency repair myself/);
    assert.match(panel, /<div className="alert success" role="status">/);
  });
});

describe('admin repairs page', () => {
  const page = read('pages', 'admin', 'Repairs.tsx');

  it('is an admin route with a sidebar link', () => {
    assert.match(read('App.tsx'), /<Route path="repairs" element=\{<Repairs \/>\} \/>/);
    assert.ok(ADMIN_NAV.flatMap((g) => g.links).some((l) => l.to === '/admin/repairs'));
  });

  it('saves the review with PUT and an approved amount only for a self-arranged repair', () => {
    assert.match(page, /api\.put<RepairReport>\(`\/admin\/repairs\/\$\{encodeURIComponent\(r\.id\)\}`, body\)/);
    assert.match(page, /\{r\.selfArranged && \(\s*<label htmlFor=\{`\$\{prefix\}-approved`\}>/);
    // The body is built from what the form shows when Save review is clicked.
    assert.deepEqual(repairReviewBody(true, 'RESOLVED', '200', 'sorry, thank you'),
      { status: 'RESOLVED', adminNote: 'sorry, thank you', approvedAmount: 200 });
    assert.deepEqual(repairReviewBody(true, 'REPORTED', '', '  '), { status: 'REPORTED', adminNote: null, approvedAmount: null });
    assert.deepEqual(repairReviewBody(false, 'UNDER_REVIEW', '200', 'x'), { status: 'UNDER_REVIEW', adminNote: 'x', approvedAmount: null });
    assert.equal(repairReviewBody(true, 'resolved', '200', ''), null, 'only the exact status values');
    assert.equal(repairReviewBody(true, null, '200', ''), null);
  });

  // The manual test: an approved amount saved with Status still Reported, repeatedly, so the rental stayed blocked.
  it('sends the status the form shows and takes the saved report from the server answer', () => {
    assert.match(page, /const form = new FormData\(e\.currentTarget\);/);
    assert.match(page, /repairReviewBody\(r\.selfArranged, form\.get\('status'\), approved, String\(form\.get\('adminNote'\) \?\? ''\)\)/);
    assert.match(page, /<select id=\{`\$\{prefix\}-status`\} name="status" defaultValue=\{r\.status\}>/);
    assert.match(page, /<form className="admin-form" onSubmit=\{save\} autoComplete="off"/);
    // The PUT answer replaces the report; a new saved version restarts the form from it.
    assert.match(page, /const updated = await action\.run\(\(\) => api\.put<RepairReport>/);
    assert.match(page, /if \(updated\) onSaved\(updated\);/);
    assert.match(page, /list\.setData\(\(reports\) => \(reports \?\? \[\]\)\.map\(\(r\) => \(r\.id === updated\.id \? updated : r\)\)\);/);
    assert.match(page, /key=\{`\$\{r\.id\}@\$\{r\.updatedAt\}`\}/);
    // No copy of the status in component state: the badge and the hint read the saved report.
    assert.doesNotMatch(page, /useState<RepairStatus>\(r\.status\)/);
    assert.match(page, /\{REPAIR_STATUS_LABEL\[r\.status\]\}/);
    assert.match(page, /\{r\.selfArranged && r\.status !== 'RESOLVED' && \(\s*<div className="alert warning small" role="note">\s*\{RESOLVE_TO_BILL\}/);
    assert.match(RESOLVE_TO_BILL, /choose Resolved in Status, then click Save review/);
  });

  it('confirms the saved status from the server, never the unsaved form', () => {
    assert.equal(savedReviewMessage(true, 'RESOLVED'), 'Saved. Status is now Resolved. The customer has been notified.');
    assert.equal(savedReviewMessage(true, 'REPORTED'),
      'Saved with status Reported. This report is still not Resolved, so the rental cannot be ended yet.');
    assert.equal(savedReviewMessage(false, 'ASSISTANCE_ARRANGED'),
      'Saved with status Assistance arranged. The customer has been notified.');
    assert.match(page, /\{savedReviewMessage\(r\.selfArranged, savedStatus\)\}/);
    assert.match(page, /setSaved\(\{ id: updated\.id, status: updated\.status \}\);/);
  });

  it('never shows a refused save (401) as saved, says it was not saved and asks to sign in again', () => {
    // A failed PUT returns undefined from action.run, so onSaved (and its success message) never runs.
    assert.match(page, /if \(updated\) onSaved\(updated\);/);
    const auth = read('auth.tsx');
    assert.match(auth, /setUnauthorizedHandler\(expire\);/);
    assert.match(auth, /const expire = useCallback\(\(\) => \{\s*logout\(\);\s*setSessionEnded\(true\);\s*\}, \[logout\]\);/);
    // Signing in again clears the notice, and saving then works as before.
    assert.equal((auth.match(/setSessionEnded\(false\);/g) || []).length, 2, 'login and register');
    const login = read('pages', 'Auth.tsx');
    assert.match(login, /const \{ login, sessionEnded \} = useAuth\(\);/);
    assert.match(login, /\{sessionEnded && \(\s*<div className="alert warning" role="alert" id="session-ended">\s*\{SESSION_ENDED_MESSAGE\}/);
    assert.match(SESSION_ENDED_MESSAGE, /Anything you were saving was not saved: sign in again, then repeat it\./);
  });

  it('lets only the saved repair status hold back the end of the rental, read again when the page is shown', () => {
    const detail = read('pages', 'BookingDetail.tsx');
    assert.match(detail, /const openRepairs = unresolvedReimbursements\(repairs\.data \?\? \[\]\);/);
    assert.match(detail, /document\.addEventListener\('visibilitychange', reloadRepairs\);/);
    assert.match(detail, /window\.addEventListener\('focus', reloadRepairs\);/);
    assert.match(detail, /api\.get<RepairReport\[\]>\(`\$\{bookingApi\}\/repairs`\)\.then\(setRepairs, \(\) => \{\}\);/);
  });

  it('says plainly how an approved reimbursement affects the bill, and moves no money itself', () => {
    // BE-043: an approved amount on a Resolved report is deducted from the final bill; the claim never is.
    assert.match(page, /An approved reimbursement on a Resolved report is deducted\s+from the customer&apos;s final bill/);
    assert.match(page, /the customer&apos;s claimed amount never is/);
    assert.doesNotMatch(page, /stripe|refund\(/i);
  });
});

describe('admin GPS history of one rental', () => {
  const page = read('pages', 'admin', 'GpsHistory.tsx');

  it('loads only the selected booking from the admin endpoint', () => {
    assert.match(page, /api\.get<BookingGpsHistory>\(`\/admin\/gps\/bookings\/\$\{encodeURIComponent\(id\)\}\/history`\)/);
    assert.match(read('App.tsx'), /<Route path="gps\/bookings\/:id" element=\{<GpsHistory \/>\} \/>/);
    assert.equal(adminGpsHistoryPath('a/b'), '/admin/gps/bookings/a%2Fb');
  });

  it('draws the stored route on the existing map with start and end markers, and lists the points in order', () => {
    assert.match(page, /trail=\{h\.points\.length > 1 \? h\.points\.map\(/);
    assert.match(page, /center=\{view\.center\}\s+zoom=\{view\.zoom\}/);
    assert.match(page, /id: 'start'/);
    assert.match(page, /id: 'end'/);
    assert.match(page, /<caption className="sr-only">GPS reports for \{h\.reference\}, oldest first<\/caption>/);
    assert.doesNotMatch(page, /Math\.random|simulat|fake/i);
  });

  it('is reachable from Live GPS and from the admin booking page', () => {
    assert.match(read('pages', 'admin', 'Gps.tsx'), /adminGpsHistoryPath\(chosen\.activeBookingId\)/);
    assert.match(read('pages', 'BookingDetail.tsx'), /\{inAdmin && \(b\.status === 'ACTIVE' \|\| b\.status === 'COMPLETED'\) && \(/);
  });
});
