/**
 * Repair and breakdown reports (backend BE-039). Kept free of runtime imports so `npm test` can run them.
 */
import type { RepairReport, RepairStatus } from './types';

export const REPAIR_GUIDANCE =
  'If a breakdown or repair issue occurs, report it immediately. We can arrange assistance/mechanic support. If you arrange an emergency repair yourself, reimbursement is subject to admin review and approval. Keep the receipt/proof and repair details.';

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  REPORTED: 'Reported',
  ASSISTANCE_ARRANGED: 'Assistance arranged',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
};

export const REPAIR_STATUSES: RepairStatus[] = ['REPORTED', 'ASSISTANCE_ARRANGED', 'UNDER_REVIEW', 'RESOLVED'];

export const REPAIR_STATUS_TONE: Record<RepairStatus, 'amber' | 'blue' | 'green' | ''> = {
  REPORTED: 'amber',
  ASSISTANCE_ARRANGED: 'blue',
  UNDER_REVIEW: 'amber',
  RESOLVED: 'green',
};

/** The first problem with a customer's report, or null when it can be sent. */
export function repairReportProblem(description: string, selfArranged: boolean, claimed: string): string | null {
  if (!description.trim()) return 'Describe the problem.';
  if (description.length > 2000) return 'Keep the description to 2000 characters.';
  if (selfArranged && claimed.trim() !== '' && !isRupeeAmount(claimed)) {
    return 'Enter the repair amount as a number of rupees, or leave it empty.';
  }
  return null;
}

/**
 * A non-negative LKR amount with at most two decimals and at most 8 digits before the point (the backend's limit for
 * claimed and approved amounts). Empty is not an amount.
 */
export function isRupeeAmount(value: string): boolean {
  const v = value.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(v)) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

// ─── Photos (optional evidence, backend BE-043) ───────────────────────────────

export const PHOTO_HINT = 'Optional — add photos of the breakdown or repair receipt.';
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** The image types the backend accepts; it checks the file content as well. SVG, GIF, HTML and the rest are refused. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const NO_PHOTOS = 'No photos attached.';

type ChosenFile = { name: string; type: string; size: number };

/** Why a chosen file cannot be attached, or null when it can (the server checks the content again). */
export function photoProblem(file: ChosenFile): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type) || !PHOTO_EXTENSIONS.test(file.name)) {
    return `${file.name} is not a JPEG, PNG or WebP image.`;
  }
  if (file.size > MAX_PHOTO_BYTES) return `${file.name} is larger than 5 MB.`;
  return null;
}

/** Adds newly chosen files to those already selected: valid ones up to the limit, with a message for the rest. */
export function addPhotos<F extends ChosenFile>(current: F[], chosen: F[]): { photos: F[]; problem: string | null } {
  const photos = [...current];
  let problem: string | null = null;
  for (const f of chosen) {
    const issue = photoProblem(f);
    if (issue) {
      problem ??= issue;
    } else if (photos.length >= MAX_PHOTOS) {
      problem ??= `Attach at most ${MAX_PHOTOS} photos.`;
    } else {
      photos.push(f);
    }
  }
  return { photos, problem };
}

/** The authorised API path of one repair photo (fetched with the signed-in user's token, never a public URL). */
export const repairPhotoPath = (reportId: string, photoId: string) =>
  `/repairs/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photoId)}`;

/** "1.2 MB" / "350 KB" for a selected photo. */
export function fileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ─── Reimbursement wording ────────────────────────────────────────────────────

/** How an approved amount affects the bill; the claimed amount is never described as a deduction. */
export function reimbursementNote(status: RepairStatus, approved: number | null): string {
  if (approved == null) return '';
  return status === 'RESOLVED'
    ? 'Deducted from the final bill.'
    : 'Deducted from the final bill once the report is resolved.';
}

/**
 * Self-arranged reports not yet RESOLVED: an admin may still approve a reimbursement on them, so the backend does
 * not calculate the final bill (end the rental) until they are resolved.
 */
export const unresolvedReimbursements = (reports: readonly Pick<RepairReport, 'selfArranged' | 'status'>[]) =>
  reports.filter((r) => r.selfArranged && r.status !== 'RESOLVED');

export const UNRESOLVED_REPAIRS_ADMIN =
  'This rental has unresolved repair reports. Resolve them before calculating the final bill: open Repairs, review the report, enter any approved reimbursement, set it to Resolved and save, then come back and end the rental.';

export const UNRESOLVED_REPAIRS_CUSTOMER =
  'Your repair report is still being reviewed. The rental can be ended once our team has resolved it, so any approved reimbursement is included in your final bill.';

export const CLAIM_NOTE = 'A claimed amount is reviewed by our team; only an approved amount reduces the bill.';
export const APPROVAL_HELP =
  "Deducted from the customer's final bill when the rental ends, once the report is Resolved. The customer's claimed amount is never deducted automatically.";
