-- 054: record any provider fee that exceeds the hotel's Mealvest commission.
-- The hotel still receives its fixed 90% share; the shortfall is a MEALVEST
-- cost and must be visible separately from the provider fee and the payout fee.
ALTER TABLE hotel_payouts
  ADD COLUMN IF NOT EXISTS provider_fee_shortfall_amount NUMERIC(12, 2);
