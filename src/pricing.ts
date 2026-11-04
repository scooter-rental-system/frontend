/**
 * Rental pricing (backend decision E2, PricingService). The backend is the source of every amount that is charged;
 * this copy of the rule only drives the running estimate during a rental and the explanations shown to customers.
 * Kept free of runtime imports so `npm test` can run it directly.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A scooter remainder of more than this is charged as another day. */
const SCOOTER_HOURLY_LIMIT_MS = 8 * HOUR_MS;
/** A gear remainder of up to this is included in the days already charged. */
const GEAR_GRACE_MS = 12 * HOUR_MS;

/** Kilometres included per charged scooter day, and at least once per rental (PricingService.INCLUDED_KM_PER_DAY). */
export const INCLUDED_KM_PER_DAY = 120;

export const SCOOTER_PRICING_RULE =
  'Each full 24 hours is charged at the daily rate. Extra time up to 8 hours is charged hourly; more than 8 extra hours is charged as an additional day.';

export const DISTANCE_PRICING_RULE = `Every rental includes ${INCLUDED_KM_PER_DAY} km, and each additional charged day adds another ${INCLUDED_KM_PER_DAY} km. Only distance above the allowance is charged, at the scooter's excess-km rate.`;

export const GEAR_PRICING_RULE =
  'Gear is charged per day. Up to 12 extra hours are included; more than 12 extra hours is charged as an additional day.';

/** Whole days at the daily rate and extra started hours at the extra-hour rate (minimum one hour). */
export function scooterTime(durationMs: number): { days: number; extraHours: number } {
  const ms = Math.max(durationMs, 1);
  const days = Math.floor(ms / DAY_MS);
  const rest = ms - days * DAY_MS;
  if (rest > SCOOTER_HOURLY_LIMIT_MS) return { days: days + 1, extraHours: 0 };
  return { days, extraHours: Math.ceil(rest / HOUR_MS) };
}

/** Charged gear days: whole days, plus one when more than 12 hours remain; at least one. */
export function gearDays(durationMs: number): number {
  const ms = Math.max(durationMs, 1);
  const days = Math.floor(ms / DAY_MS) + (ms % DAY_MS > GEAR_GRACE_MS ? 1 : 0);
  return Math.max(1, days);
}

/** The scooter time charge for a duration, from the scooter's daily and extra-hour rates. */
export function scooterTimeCost(durationMs: number, dailyRate: number, hourlyRate: number): number {
  const t = scooterTime(durationMs);
  return t.days * dailyRate + t.extraHours * hourlyRate;
}

/** Kilometres included for a rental charged this many days: at least one day's allowance. */
export function includedKm(chargedDays: number): number {
  return Math.max(1, chargedDays) * INCLUDED_KM_PER_DAY;
}

/** The chargeable kilometres above the allowance. */
export function excessKm(distanceKm: number, chargedDays: number): number {
  return Math.max(0, distanceKm - includedKm(chargedDays));
}
