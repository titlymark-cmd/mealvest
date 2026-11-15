/**
 * MEALVEST's hotel payout fee is fixed at 10%. It is applied once when a
 * meal is redeemed and frozen on that order; later settings changes never
 * recalculate an existing order or payout.
 */
export type PayoutMode = "daily";

export const PAYOUT_MODE: PayoutMode = "daily";
export const PAYOUT_FEE_PERCENT = 10;

export interface ProviderFeeAllocation {
  grossAmount: number;
  payoutFeeAmount: number; // Mealvest's 10% commission share
  hotelAmount: number; // hotel's 90% share
  providerFeeAmount: number | null; // actual provider-side fee, null until confirmed
  mealvestNetAmount: number | null; // commission less actual provider fee
  providerFeeShortfallAmount: number | null; // provider fee above Mealvest's commission
  hotelReceives: number; // hotelAmount; unchanged even if provider fee exists
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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

/**
 * Provider fees are charged against MEALVEST's 10% share only. The hotel
 * always receives its frozen 90% share; any fee above the 10% commission is a
 * Mealvest shortfall, not a hotel deduction.
 */
export function allocateProviderFee(
  grossAmount: number,
  providerFeeAmount: number | null | undefined,
  payoutFeeAmount: number | null | undefined = null
): ProviderFeeAllocation {
  const gross = Number.isFinite(grossAmount) ? grossAmount : 0;
  const mealvestCommission =
    payoutFeeAmount != null && Number.isFinite(payoutFeeAmount) ? money(payoutFeeAmount) : splitOrderAmount(gross).payoutFeeAmount;
  const hotelAmount = money(gross - mealvestCommission);
  const providerFee =
    providerFeeAmount != null && Number.isFinite(providerFeeAmount) ? money(Math.max(0, providerFeeAmount)) : null;
  const mealvestNetAmount = providerFee == null ? null : money(mealvestCommission - providerFee);
  const providerFeeShortfallAmount =
    providerFee == null ? null : money(Math.max(0, providerFee - mealvestCommission));

  return {
    grossAmount: gross,
    payoutFeeAmount: mealvestCommission,
    hotelAmount,
    providerFeeAmount: providerFee,
    mealvestNetAmount,
    providerFeeShortfallAmount,
    hotelReceives: hotelAmount,
  };
}
