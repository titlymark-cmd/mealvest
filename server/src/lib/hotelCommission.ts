/**
 * The ONE place that defines MEALVEST's commission defaults per payout
 * mode and how a hotel's effective commission is derived.
 *
 *   effective = commission_override_percent   (explicit admin decision), else
 *               the default for the hotel's payout_mode
 *
 * Everything that needs a hotel's rate — redemption (orderService), the
 * admin and hotel views — goes through `EFFECTIVE_COMMISSION_SQL` or
 * `effectiveCommissionPercent`, so the rule cannot drift between callers
 * and a payout-mode change can never overwrite an override (the override
 * lives in its own column and is only written by the admin endpoints).
 * The commission is applied exactly once, at redemption, and frozen onto
 * the order (orders.commission_amount / hotel_amount); changing a rate
 * never touches orders that were already redeemed.
 */

export type PayoutMode = "instant" | "daily";

export const PAYOUT_MODES: readonly PayoutMode[] = ["instant", "daily"];

export const DEFAULT_COMMISSION_PERCENT: Record<PayoutMode, number> = {
  instant: 15,
  daily: 10,
};

/** Documented policy range for an administrator override (mirrors the DB CHECK in migration 051). */
export const MIN_COMMISSION_OVERRIDE_PERCENT = 0;
export const MAX_COMMISSION_OVERRIDE_PERCENT = 30;

export function isPayoutMode(value: unknown): value is PayoutMode {
  return value === "instant" || value === "daily";
}

/** Pure form of the rule, for code that already has the hotel row (and for tests). */
export function effectiveCommissionPercent(mode: PayoutMode, overridePercent: number | string | null | undefined): number {
  if (overridePercent !== null && overridePercent !== undefined && overridePercent !== "") {
    const n = Number(overridePercent);
    if (Number.isFinite(n)) return n;
  }
  return DEFAULT_COMMISSION_PERCENT[mode];
}

/** True when the rate in use is an explicit administrator override (as opposed to the mode default). */
export function hasCommissionOverride(overridePercent: number | string | null | undefined): boolean {
  return overridePercent !== null && overridePercent !== undefined && overridePercent !== "";
}

/**
 * SQL form of the same rule, for a hotels row aliased `alias`. Built from
 * DEFAULT_COMMISSION_PERCENT so the defaults live in exactly one place.
 */
export function effectiveCommissionSql(alias = "hotels"): string {
  return (
    `COALESCE(${alias}.commission_override_percent, ` +
    `CASE ${alias}.payout_mode WHEN 'daily' THEN ${DEFAULT_COMMISSION_PERCENT.daily} ELSE ${DEFAULT_COMMISSION_PERCENT.instant} END)`
  );
}

/** Same rounding the order flow has always used (2 dp, half away from zero via Math.round). */
export function splitOrderAmount(amount: number, commissionPercent: number): { commissionAmount: number; hotelAmount: number } {
  const commissionAmount = Math.round(amount * (commissionPercent / 100) * 100) / 100;
  const hotelAmount = Math.round((amount - commissionAmount) * 100) / 100;
  return { commissionAmount, hotelAmount };
}
