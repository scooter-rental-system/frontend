/**
 * Repair and breakdown reports (backend BE-039). Kept free of runtime imports so `npm test` can run them.
 */
import type { RepairStatus } from './types';

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
  if (selfArranged && claimed.trim() !== '') {
    const n = Number(claimed);
    if (!Number.isFinite(n) || n < 0) return 'Enter the repair amount as a number of rupees, or leave it empty.';
  }
  return null;
}
