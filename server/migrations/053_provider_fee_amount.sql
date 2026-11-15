-- 053: keep provider-side transfer fees separate from the MEALVEST fee.
-- This does not change hotel_amount / commission_amount or historical rows.
ALTER TABLE hotel_payouts
  ADD COLUMN IF NOT EXISTS provider_fee_amount NUMERIC(12, 2);
