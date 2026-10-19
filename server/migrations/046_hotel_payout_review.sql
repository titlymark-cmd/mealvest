-- 046 — Hotel payout state machine, review & approval fields (H3)
--
-- Before: any error from the provider call (including a timeout, where
-- the transfer may well have gone through) marked the payout 'failed'
-- and released its orders; the next "Pay out" then sent the same money
-- again under a NEW reference.
--
-- States (enforced by trg_hotel_payouts_transition below):
--   pending     orders claimed, not yet sent to the provider
--   review      held for an admin decision (over a limit) — never sent
--   approved    an admin approved a 'review' payout; ready to send
--   unknown     a send was ATTEMPTED and its outcome is not confirmed
--               (in-flight, timeout, network error, provider 5xx).
--               Orders stay claimed. Only reconciliation of the SAME
--               reference may move it on — never a new transfer.
--   processing  provider accepted the transfer; awaiting final status
--   successful  provider confirmed paid            (terminal)
--   failed      provider confirmed not paid; orders released (terminal)
--   cancelled   admin cancelled before sending; orders released (terminal)
--
-- Backfill: rows still 'pending' were created by the old code and their
-- send outcome is genuinely unknown (the process died between claiming
-- and recording the provider response), so they become 'unknown'.
--
-- Rollback / forward recovery: drop the trigger + function, restore the
-- old CHECK (after moving review/approved/unknown/cancelled rows to a
-- reviewed final state BY HAND). Never delete payout rows.

ALTER TABLE hotel_payouts
  ADD COLUMN IF NOT EXISTS review_reason         TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_admin_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_attempts   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconcile_claimed_until TIMESTAMPTZ;

ALTER TABLE hotel_payouts DROP CONSTRAINT IF EXISTS hotel_payouts_status_check;
ALTER TABLE hotel_payouts ADD CONSTRAINT hotel_payouts_status_check
  CHECK (status IN ('pending', 'review', 'approved', 'unknown', 'processing', 'successful', 'failed', 'cancelled'));

UPDATE hotel_payouts
   SET status = 'unknown',
       failure_reason = COALESCE(failure_reason, 'Send outcome not recorded (pre-046 row) — reconcile before any re-send')
 WHERE status = 'pending';

CREATE OR REPLACE FUNCTION enforce_hotel_payout_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (OLD.status = 'pending'    AND NEW.status IN ('unknown', 'review', 'failed'))
    OR (OLD.status = 'review'     AND NEW.status IN ('approved', 'cancelled'))
    OR (OLD.status = 'approved'   AND NEW.status IN ('unknown', 'failed', 'cancelled'))
    OR (OLD.status = 'unknown'    AND NEW.status IN ('processing', 'successful', 'failed'))
    OR (OLD.status = 'processing' AND NEW.status IN ('successful', 'failed'))
  ) THEN
    RAISE EXCEPTION 'hotel_payouts: illegal status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  -- Amount, hotel and reference are fixed once a payout exists.
  IF NEW.amount <> OLD.amount OR NEW.hotel_id <> OLD.hotel_id OR NEW.transfer_reference <> OLD.transfer_reference THEN
    RAISE EXCEPTION 'hotel_payouts: amount, hotel and reference are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hotel_payouts_transition ON hotel_payouts;
CREATE TRIGGER trg_hotel_payouts_transition
  BEFORE UPDATE ON hotel_payouts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_hotel_payout_transition();

-- Immutable fields even when status does not change.
CREATE OR REPLACE FUNCTION forbid_hotel_payout_core_change() RETURNS trigger AS $$
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.hotel_id <> OLD.hotel_id OR NEW.transfer_reference <> OLD.transfer_reference THEN
    RAISE EXCEPTION 'hotel_payouts: amount, hotel and reference are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hotel_payouts_core_immutable ON hotel_payouts;
CREATE TRIGGER trg_hotel_payouts_core_immutable
  BEFORE UPDATE OF amount, hotel_id, transfer_reference ON hotel_payouts
  FOR EACH ROW
  EXECUTE FUNCTION forbid_hotel_payout_core_change();

-- At most one not-yet-sent payout per hotel at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_payouts_one_unsent_per_hotel
  ON hotel_payouts (hotel_id)
  WHERE status IN ('pending', 'review', 'approved');

-- Reconciliation work queue.
CREATE INDEX IF NOT EXISTS idx_hotel_payouts_unresolved
  ON hotel_payouts (created_at)
  WHERE status IN ('unknown', 'processing');
