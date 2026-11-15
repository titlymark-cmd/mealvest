-- 055: distinguish actual provider fees from fee quotes or unavailable data.
-- Existing recorded provider fees came from payout responses and remain confirmed;
-- missing fees stay unknown. No historical payout amounts are recalculated.
ALTER TABLE hotel_payouts
  ADD COLUMN IF NOT EXISTS provider_fee_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_payout_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS provider_payout_amount_status TEXT NOT NULL DEFAULT 'unknown';

UPDATE hotel_payouts
   SET provider_fee_status = CASE
     WHEN provider_fee_amount IS NULL THEN 'unknown'
     ELSE 'confirmed'
   END,
       provider_payout_amount_status = CASE
         WHEN provider_payout_amount IS NULL THEN 'unknown'
         ELSE 'confirmed'
       END;

UPDATE hotel_payouts
   SET provider_fee_shortfall_amount = GREATEST(0, provider_fee_amount - COALESCE(payout_fee_amount, 0))
 WHERE provider_fee_amount IS NOT NULL;

ALTER TABLE hotel_payouts
  ADD CONSTRAINT hotel_payouts_provider_fee_status_check
    CHECK (provider_fee_status IN ('unknown', 'confirmed')),
  ADD CONSTRAINT hotel_payouts_provider_fee_confirmation_check
    CHECK ((provider_fee_status = 'confirmed') = (provider_fee_amount IS NOT NULL)),
  ADD CONSTRAINT hotel_payouts_provider_fee_nonnegative_check
    CHECK (provider_fee_amount IS NULL OR provider_fee_amount >= 0),
  ADD CONSTRAINT hotel_payouts_provider_amount_status_check
    CHECK (provider_payout_amount_status IN ('unknown', 'confirmed')),
  ADD CONSTRAINT hotel_payouts_provider_amount_confirmation_check
    CHECK ((provider_payout_amount_status = 'confirmed') = (provider_payout_amount IS NOT NULL)),
  ADD CONSTRAINT hotel_payouts_provider_amount_positive_check
    CHECK (provider_payout_amount IS NULL OR provider_payout_amount > 0);
