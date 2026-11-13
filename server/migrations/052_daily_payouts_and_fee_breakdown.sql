-- 052 — Daily-only hotel payouts and explicit payout-fee breakdown.
--
-- Existing order and payout amounts are not recalculated. New redemptions
-- use the fixed 10% fee; already-redeemed orders retain their frozen split.

ALTER TABLE hotels ALTER COLUMN payout_mode SET DEFAULT 'daily';

UPDATE hotels
   SET payout_mode = 'daily',
       payout_time = COALESCE(payout_time, TIME '18:00'),
       commission_override_percent = NULL;

ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_payout_mode_check;
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_daily_requires_time;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_payout_mode_check CHECK (payout_mode = 'daily'),
  ALTER COLUMN payout_time SET NOT NULL;

ALTER TABLE hotel_payouts
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payout_fee_amount NUMERIC(12, 2);

WITH payout_breakdown AS (
  SELECT payout_id,
         SUM(COALESCE(hotel_amount, 0) + COALESCE(commission_amount, 0)) AS gross_amount,
         SUM(COALESCE(commission_amount, 0)) AS payout_fee_amount
    FROM orders
   WHERE payout_id IS NOT NULL
   GROUP BY payout_id
)
UPDATE hotel_payouts p
   SET gross_amount = b.gross_amount,
       payout_fee_amount = b.payout_fee_amount
  FROM payout_breakdown b
 WHERE p.id = b.payout_id
   AND (p.gross_amount IS NULL OR p.payout_fee_amount IS NULL);
