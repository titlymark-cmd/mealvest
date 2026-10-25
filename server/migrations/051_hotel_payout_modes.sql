-- 051 — Hotel payout modes (instant | daily), payout time, and per-hotel
-- commission OVERRIDE.
--
-- Backward compatible: additive only, nothing dropped, no historical
-- financial row (orders.commission_amount / hotel_amount, hotel_payouts)
-- is touched.
--
-- Commission model
--   * hotels.commission_override_percent  NULL  = no override -> the
--       effective rate is the DEFAULT for the hotel's payout mode
--       (instant 15%, daily 10%; defined once in src/lib/hotelCommission.ts).
--     NOT NULL = an explicit administrator decision, used in either mode.
--   * The legacy hotels.commission_percent column (CHECK <= 10) is no
--     longer read by any code path; it is left in place, unmodified, as
--     history. Its value is copied into the override below so every
--     EXISTING hotel keeps exactly the rate it is charged today (a silent
--     jump to 15% would be an unannounced financial change).
--   * The 0-30% range below is the documented policy for overrides. It is
--     required because the old 0-10% CHECK cannot hold the 15% default.
--
-- Payout mode
--   * payout_mode: existing hotels become 'instant' (their current
--     behaviour). 'daily' requires payout_time.
--   * payout_time: wall-clock TIME in the business timezone
--     (BUSINESS_TIMEZONE, default Africa/Nairobi). Stored WITHOUT a zone
--     on purpose: "9:00 PM" means 9 PM Nairobi time, never a UTC instant.
--
-- hotel_daily_payout_runs: one durable row per (hotel, Nairobi calendar
--   day) recording that the scheduled evaluation ran and what it did.
--   It only stops the SCHEDULER re-evaluating the same day; money safety
--   still comes from the existing order claim (orders.payout_id under the
--   hotel row lock + the one-unsent-payout-per-hotel index), never from
--   this table or the date.
--
-- Rollback (forward-only recommended): DROP TABLE hotel_daily_payout_runs;
--   ALTER TABLE hotels DROP COLUMN payout_mode, payout_time,
--   commission_override_percent;  (only if no code version that reads
--   them is deployed).

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS payout_mode TEXT NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS payout_time TIME,
  ADD COLUMN IF NOT EXISTS commission_override_percent NUMERIC(5, 2);

ALTER TABLE hotels
  ADD CONSTRAINT hotels_payout_mode_check CHECK (payout_mode IN ('instant', 'daily')),
  ADD CONSTRAINT hotels_daily_requires_time CHECK (payout_mode <> 'daily' OR payout_time IS NOT NULL),
  ADD CONSTRAINT hotels_commission_override_range
    CHECK (commission_override_percent IS NULL OR (commission_override_percent >= 0 AND commission_override_percent <= 30));

-- Preserve each existing hotel's current effective rate as an explicit value.
UPDATE hotels SET commission_override_percent = commission_percent WHERE commission_override_percent IS NULL;

CREATE TABLE IF NOT EXISTS hotel_daily_payout_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       UUID NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  run_date       DATE NOT NULL,                       -- business-timezone calendar day
  scheduled_time TIME NOT NULL,                       -- the hotel's payout_time when it was evaluated
  status         TEXT NOT NULL DEFAULT 'claimed'
                   CHECK (status IN ('claimed', 'initiated', 'below_threshold', 'nothing', 'skipped', 'error')),
  attempts       INTEGER NOT NULL DEFAULT 1,
  payout_id      UUID REFERENCES hotel_payouts(id) ON DELETE SET NULL,
  detail         TEXT,
  claimed_until  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_payout_runs_open ON hotel_daily_payout_runs (run_date) WHERE status IN ('claimed', 'skipped', 'error');

CREATE TRIGGER trg_hotel_daily_payout_runs_updated_at
  BEFORE UPDATE ON hotel_daily_payout_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Same deny-by-default posture as every other table (044).
ALTER TABLE hotel_daily_payout_runs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON hotel_daily_payout_runs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON hotel_daily_payout_runs FROM authenticated';
  END IF;
END $$;
