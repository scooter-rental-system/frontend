/**
 * Account rules shared by the customer profile and the admin profile. Kept free of runtime imports so `npm test` can
 * run them. The backend checks the same password length (8-72) and the current password.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

/** The first problem with a password change form, or null when it can be sent. */
export function passwordChangeProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) {
    return `The new password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
  }
  if (next === current) return 'The new password must be different from your current password.';
  if (next !== confirm) return 'The new passwords do not match.';
  return null;
}
