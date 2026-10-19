-- 047 — Savings withdrawal: exactly-once restoration on rejection (M1)
--
-- withdrawSavings() closes the plan (status 'completed', remaining 0)
-- when the request is made. Before this migration an admin 'rejected'
-- status left the money gone from the student's view, and the unique
-- index on budget_id prevented ever requesting again.
--
-- Now a rejection restores the reserved gross amount in the same
-- database transaction, recorded by restored_at (set at most once,
-- enforced below), and a REJECTED request no longer blocks a new one.
--
-- Rollback: only safe if no second request exists for a rejected
-- budget. Re-create the old unique index and drop the new columns;
-- never delete withdrawal rows.

ALTER TABLE savings_withdrawals
  ADD COLUMN IF NOT EXISTS restored_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restored_amount       NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS restored_to_budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL;

ALTER TABLE savings_withdrawals DROP CONSTRAINT IF EXISTS chk_withdrawal_restored_only_when_rejected;
ALTER TABLE savings_withdrawals ADD CONSTRAINT chk_withdrawal_restored_only_when_rejected
  CHECK (restored_at IS NULL OR status = 'rejected');

-- One LIVE (non-rejected) withdrawal per budget.
DROP INDEX IF EXISTS idx_savings_withdrawals_budget_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_savings_withdrawals_budget_live
  ON savings_withdrawals (budget_id)
  WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_savings_withdrawals_budget_id_all
  ON savings_withdrawals (budget_id);

-- restored_at / restored_amount can be written once and never changed,
-- and a rejected (final) withdrawal can never change status again.
CREATE OR REPLACE FUNCTION protect_withdrawal_restoration() RETURNS trigger AS $$
BEGIN
  IF OLD.restored_at IS NOT NULL AND (
       NEW.restored_at IS DISTINCT FROM OLD.restored_at
    OR NEW.restored_amount IS DISTINCT FROM OLD.restored_amount
    OR NEW.restored_to_budget_id IS DISTINCT FROM OLD.restored_to_budget_id) THEN
    RAISE EXCEPTION 'savings_withdrawals: restoration already recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('rejected', 'completed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'savings_withdrawals: % is final', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_savings_withdrawals_restore_once ON savings_withdrawals;
CREATE TRIGGER trg_savings_withdrawals_restore_once
  BEFORE UPDATE ON savings_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION protect_withdrawal_restoration();
