// Run with `npm test` (Node's built-in test runner).
// Repair/breakdown reports (backend BE-039) and the admin GPS history of one rental (BE-040). Source checks are
// CRLF-safe; nothing here simulates GPS or payments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN_NAV } from './admin.ts';
import { REPAIR_GUIDANCE, REPAIR_STATUS_LABEL, REPAIR_STATUSES, repairReportProblem } from './repairs.ts';
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
    assert.match(page, /approvedAmount: r\.selfArranged \? amount : null/);
    assert.match(page, /\{r\.selfArranged && \(\s*<label htmlFor=\{`\$\{prefix\}-approved`\}>/);
  });

  it('says plainly that an approved reimbursement moves no money', () => {
    assert.match(page, /An approved reimbursement is a record only/);
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
