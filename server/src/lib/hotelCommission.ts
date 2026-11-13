/**
 * MEALVEST's hotel payout fee is fixed at 10%. It is applied once when a
 * meal is redeemed and frozen on that order; later settings changes never
 * recalculate an existing order or payout.
 */
export type PayoutMode = "daily";

export const PAYOUT_MODE: PayoutMode = "daily";
export const PAYOUT_FEE_PERCENT = 10;

export function isPayoutMode(value: unknown): value is PayoutMode {
  return value === "daily";
}

/** SQL literal for read-only rate displays; the fee is not hotel-configurable. */
export function payoutFeeSql(): string {
  return String(PAYOUT_FEE_PERCENT);
}

/** Splits a redeemed meal amount using integer cents to keep the 10% fee precise. */
export function splitOrderAmount(amount: number): { payoutFeeAmount: number; hotelAmount: number } {
  const grossCents = Math.round(amount * 100);
  const payoutFeeCents = Math.round((grossCents * PAYOUT_FEE_PERCENT) / 100);
  return {
    payoutFeeAmount: payoutFeeCents / 100,
    hotelAmount: (grossCents - payoutFeeCents) / 100,
  };
}
