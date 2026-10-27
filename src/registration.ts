/**
 * Registration rules shared with the backend (BE-035). Kept free of runtime imports so `npm test` can run them.
 */

/**
 * SDS 6.3: a Sri Lankan NIC number. Old format: 9 digits then V or X (either case); new format: 12 digits.
 * Same rule as the backend's UserDtos.SRI_LANKAN_NIC; surrounding spaces are trimmed before checking.
 */
export const NIC_PATTERN = /^(\d{9}[VvXx]|\d{12})$/;

/** The NIC field's message, or '' when the value is valid. */
export function nicError(value: string): string {
  const nic = value.trim();
  if (!nic) return 'NIC number is required';
  if (!NIC_PATTERN.test(nic)) return 'Enter a valid NIC: 9 digits followed by V or X, or 12 digits';
  return '';
}

/** SDS 8.5: personal data is collected only with explicit consent at registration. */
export function consentError(consent: boolean): string {
  return consent ? '' : 'Please accept the terms and privacy notice to create an account';
}
