// Run with `npm test` (Node's built-in test runner).
// Repair photo evidence and approved repair reimbursement (backend BE-043): optional photos on the report form, the
// admin evidence view, the reimbursement wording, and the final invoice breakdown. Source checks are CRLF-safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  addPhotos, APPROVAL_HELP, CLAIM_NOTE, fileSize, isRupeeAmount, MAX_PHOTO_BYTES, MAX_PHOTOS, NO_PHOTOS, PHOTO_ACCEPT,
  PHOTO_HINT, photoProblem, reimbursementNote, repairPhotoPath, repairReportProblem,
} from './repairs.ts';

const src = fileURLToPath(new URL('.', import.meta.url));
const read = (...parts) => readFileSync(join(src, ...parts), 'utf8').replace(/\r\n/g, '\n');
const panel = read('components', 'RepairPanel.tsx');
const photos = read('components', 'RepairPhotos.tsx');
const admin = read('pages', 'admin', 'Repairs.tsx');
const invoice = read('components', 'InvoiceView.tsx');
const detail = read('pages', 'BookingDetail.tsx');
const api = read('api.ts');
const demoTest = read('demo.test.mjs');

const png = (name = 'tyre.png', size = 2048) => ({ name, type: 'image/png', size });

describe('photo selection', () => {
  it('is optional: a report is valid without photos', () => {
    assert.equal(repairReportProblem('Flat tyre', false, ''), null);
    assert.match(panel, /if \(photos\.length === 0\) \{\s*return api\.post<RepairReport>\(`\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/repairs`, body\);/);
  });

  it('accepts JPEG, PNG and WebP up to 5 MB', () => {
    assert.equal(photoProblem(png()), null);
    assert.equal(photoProblem({ name: 'receipt.JPG', type: 'image/jpeg', size: 1000 }), null);
    assert.equal(photoProblem({ name: 'bike.webp', type: 'image/webp', size: 1000 }), null);
    assert.equal(photoProblem(png('big.png', MAX_PHOTO_BYTES)), null);
    assert.equal(PHOTO_ACCEPT, 'image/jpeg,image/png,image/webp');
  });

  it('refuses other types, renamed files, empty and oversized files', () => {
    for (const f of [
      { name: 'logo.svg', type: 'image/svg+xml', size: 100 },
      { name: 'page.html', type: 'text/html', size: 100 },
      { name: 'anim.gif', type: 'image/gif', size: 100 },
      { name: 'tool.exe', type: 'application/x-msdownload', size: 100 },
      { name: 'photo.png.html', type: 'image/png', size: 100 },
      { name: 'photo.svg', type: 'image/png', size: 100 },
    ]) {
      assert.match(photoProblem(f), /not a JPEG, PNG or WebP image/, f.name);
    }
    assert.match(photoProblem(png('empty.png', 0)), /empty/);
    assert.match(photoProblem(png('big.png', MAX_PHOTO_BYTES + 1)), /larger than 5 MB/);
  });

  it('keeps at most three photos and says why the rest were not added', () => {
    const four = ['1.png', '2.png', '3.png', '4.png'].map((n) => png(n));
    const result = addPhotos([], four);
    assert.equal(result.photos.length, MAX_PHOTOS);
    assert.equal(result.problem, 'Attach at most 3 photos.');
    const mixed = addPhotos([png('a.png')], [{ name: 'x.svg', type: 'image/svg+xml', size: 5 }, png('b.png')]);
    assert.deepEqual(mixed.photos.map((p) => p.name), ['a.png', 'b.png']);
    assert.match(mixed.problem, /x\.svg is not a JPEG, PNG or WebP image/);
  });

  it('shows the agreed label and hint, previews and a Remove button per photo', () => {
    assert.equal(PHOTO_HINT, 'Optional — add photos of the breakdown or repair receipt.');
    assert.match(panel, /<label htmlFor=\{ids\.photos\}>Photos \(optional\)<\/label>/);
    assert.match(panel, /type="file"\s+accept=\{PHOTO_ACCEPT\}\s+multiple/);
    assert.match(panel, /<ul className="repair-photo-picker__list" aria-label="Selected photos">/);
    assert.match(panel, /aria-label=\{`Remove \$\{file\.name\}`\}/);
    assert.match(panel, /setPhotos\(\(list\) => list\.filter\(\(_, i\) => i !== index\)\)/);
    assert.match(panel, /URL\.revokeObjectURL\(u\)/);
    assert.equal(fileSize(2048), '2 KB');
    assert.equal(fileSize(3 * 1024 * 1024), '3.0 MB');
  });

  it('shows validation errors and the upload state', () => {
    assert.match(panel, /\{photoIssue && \(\s*<span className="field-error" role="alert">/);
    assert.match(panel, /photos\.length > 0 \? 'Uploading…' : 'Sending…'/);
  });

  it('sends the report and photos as multipart with the report as a JSON part', () => {
    assert.match(panel, /form\.append\('report', new Blob\(\[JSON\.stringify\(body\)\], \{ type: 'application\/json' \}\)\)/);
    assert.match(panel, /photos\.forEach\(\(p\) => form\.append\('photos', p, p\.name\)\)/);
    assert.match(panel, /postForm<RepairReport>\(`\/bookings\/\$\{encodeURIComponent\(bookingId\)\}\/repairs`, form\)/);
    assert.match(api, /export async function postForm<T>\(path: string, form: FormData\)/);
  });
});

describe('viewing evidence', () => {
  it('fetches photos with the signed-in token, never as public URLs', () => {
    assert.equal(repairPhotoPath('r/1', 'p 2'), '/repairs/r%2F1/photos/p%202');
    assert.match(photos, /getBlob\(path\)/);
    assert.match(photos, /URL\.createObjectURL\(blob\)/);
    assert.match(photos, /URL\.revokeObjectURL\(objectUrl\)/);
    assert.match(api, /export async function getBlob\(path: string\)/);
    assert.match(api, /headers: token \? \{ Authorization: `Bearer \$\{token\}` \} : \{\}/);
    assert.doesNotMatch(photos, /src=\{`\/api/);
  });

  it('shows the evidence to admins, and says when there is none', () => {
    assert.equal(NO_PHOTOS, 'No photos attached.');
    assert.match(admin, /<RepairPhotos reportId=\{r\.id\} photos=\{r\.photos \?\? \[\]\} showEmpty \/>/);
    assert.match(photos, /return showEmpty \? <p className="muted small">\{NO_PHOTOS\}<\/p> : null;/);
    assert.match(photos, /alt=\{label\}/);
  });

  it('shows the customer their own photos', () => {
    assert.match(panel, /<RepairPhotos reportId=\{r\.id\} photos=\{r\.photos \?\? \[\]\} \/>/);
  });
});

describe('claimed versus approved amounts', () => {
  it('never presents the claimed amount as a deduction', () => {
    assert.match(CLAIM_NOTE, /only an approved amount reduces the bill/);
    assert.match(admin, /customer claimed \{money\(r\.claimedAmount\)\} \(not deducted until approved\)/);
    assert.match(APPROVAL_HELP, /claimed amount is never deducted automatically/);
    for (const text of [panel, admin]) {
      assert.doesNotMatch(text, /claimed[^\n]*deducted from/i);
    }
  });

  it('describes when an approved amount reduces the bill', () => {
    assert.equal(reimbursementNote('RESOLVED', 1500), 'Deducted from the final bill.');
    assert.equal(reimbursementNote('UNDER_REVIEW', 1500), 'Deducted from the final bill once the report is resolved.');
    assert.equal(reimbursementNote('RESOLVED', null), '');
  });

  it('validates money as non-negative rupees with at most two decimals', () => {
    for (const ok of ['0', '1500', '1500.5', '1500.50', '99999999.99']) assert.equal(isRupeeAmount(ok), true, ok);
    for (const bad of ['', '-1', '1e3', 'NaN', 'Infinity', '12.345', 'abc', '1,500', '100000000']) {
      assert.equal(isRupeeAmount(bad), false, bad);
    }
    assert.match(repairReportProblem('x', true, '12.345'), /number of rupees/);
    assert.match(admin, /if \(approved\.trim\(\) !== '' && !isRupeeAmount\(approved\)\)/);
  });
});

describe('final invoice', () => {
  it('shows the rental subtotal, the approved reimbursement and the adjusted final total', () => {
    assert.match(invoice, /const credits = invoice\.kind === 'FINAL' \? invoice\.lines\.filter\(\(l\) => l\.amount < 0\) : \[\];/);
    assert.match(invoice, /<td colSpan=\{3\}>Rental subtotal<\/td>\s*<td className="num">\{money\(invoice\.subtotal\)\}<\/td>/);
    assert.match(invoice, /<td className="num">−\{money\(Math\.abs\(l\.amount\)\)\}<\/td>/);
    assert.match(invoice, /credits\.length > 0 \? 'Adjusted final total' : 'Total'/);
  });

  it('keeps the viva demo bill marked as not charged, with the same breakdown', () => {
    assert.match(detail, /<DemoSettlement booking=\{b\} invoice=\{invoices\.data\?\.find\(\(i\) => i\.kind === 'FINAL'\)\} \/>/);
    assert.match(detail, /<DetailRow label="Approved repair reimbursement">−\{money\(reimbursement\)\}<\/DetailRow>/);
    assert.match(detail, /<DetailRow label="Adjusted final total">\{money\(invoice\.total\)\}<\/DetailRow>/);
    assert.match(detail, /<DetailRow label="Payment">Not charged — viva demo<\/DetailRow>/);
    assert.match(detail, /<span className="badge amber">Not charged<\/span>/);
  });

  it('labels the live estimate as before the odometer distance and any reimbursement', () => {
    assert.match(detail, /hint="Time and gear; excess km from the odometer at return, less any approved repair reimbursement"/);
  });

  it('leaves the viva demo controls tested as before', () => {
    assert.match(demoTest, /describe\('admin demo controls'/);
  });
});
