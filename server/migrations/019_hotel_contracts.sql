-- 019: hotel contracts, commission model, terms acceptance
--
-- Per-hotel configurable commission/registration fee (never one
-- hard-coded rate for every hotel), contract lifecycle enforced by
-- the backend, and mandatory terms acceptance before a hotel account
-- can be used.
ALTER TABLE hotels
  ADD COLUMN registration_fee     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0 AND registration_fee <= 10000),
  ADD COLUMN commission_percent   NUMERIC(5, 2) NOT NULL DEFAULT 10 CHECK (commission_percent >= 0 AND commission_percent <= 10),
  ADD COLUMN contract_start_date  DATE,
  ADD COLUMN contract_end_date    DATE,
  ADD COLUMN terms_accepted       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN terms_accepted_at    TIMESTAMPTZ,
  ADD COLUMN terms_version        TEXT,
  ADD COLUMN payment_method       TEXT CHECK (payment_method IN ('bank', 'mpesa_till', 'mpesa_pochi')),
  -- Structured per-method fields in one JSONB column rather than a
  -- dozen mostly-null columns — validated at the application layer
  -- against payment_method before being written.
  ADD COLUMN payment_details      JSONB,
  ADD COLUMN owner_contact_name   TEXT,
  ADD COLUMN admin_username       TEXT,
  ADD COLUMN loyalty_incentive_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (loyalty_incentive_percent >= 0 AND loyalty_incentive_percent <= 100);

CREATE UNIQUE INDEX idx_hotels_admin_username ON hotels (admin_username) WHERE admin_username IS NOT NULL;

-- status already exists as pending_verification/active/suspended —
-- add 'expired' so contract expiry has a real status to land in,
-- computed server-side, never left to the frontend to infer.
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_status_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_status_check
  CHECK (status IN ('pending_verification', 'active', 'suspended', 'expired'));
