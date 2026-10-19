-- 043 — Budget ↔ funding transaction linkage (security finding C1)
--
-- Before this migration a student could create an ACTIVE, spendable
-- budget through POST /api/student/budget with an amount of their own
-- choosing and no payment at all. The route is now disabled in code;
-- this migration makes the database itself refuse any NEW budget that
-- is not backed by exactly one successful, owned, unused budget_topup
-- transaction, so no future code path can reintroduce the bug.
--
-- Legacy rows are NOT modified: existing budgets keep
-- funding_transaction_id = NULL. They are reported (read-only) by
-- server/scripts/auditUnpaidBudgets.js for a human remediation decision.
-- No payment records are fabricated and no balances are changed here.
--
-- Rollback / forward recovery:
--   DROP TRIGGER trg_budgets_require_funding ON budgets;
--   DROP FUNCTION enforce_budget_funding();
--   DROP INDEX idx_budgets_one_active_per_user;
--   DROP INDEX idx_budgets_funding_transaction;
--   ALTER TABLE budgets DROP COLUMN funding_transaction_id;
-- (No financial data is lost by rolling back: the column only links rows.)

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS funding_transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT;

-- One transaction can fund at most one budget (replay protection).
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_funding_transaction
  ON budgets (funding_transaction_id)
  WHERE funding_transaction_id IS NOT NULL;

-- A student may only ever have ONE active plan. This was previously a
-- check-then-insert in application code (racy). Refuse to proceed if
-- existing data already violates it rather than silently picking a
-- winner: duplicated active budgets need a human decision.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT user_id FROM budgets WHERE status = 'active' GROUP BY user_id HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Migration 043 aborted: % user(s) have more than one ACTIVE budget. Run `node scripts/auditUnpaidBudgets.js` and resolve these manually before re-running migrations.',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_one_active_per_user
  ON budgets (user_id)
  WHERE status = 'active';

-- Every budget INSERTED from now on must reference a funding
-- transaction that: exists, belongs to the same user, is a
-- budget_topup, and has status 'success'. Uniqueness above prevents
-- reuse. Updates to existing (legacy) rows are unaffected.
CREATE OR REPLACE FUNCTION enforce_budget_funding() RETURNS trigger AS $$
DECLARE
  tx RECORD;
BEGIN
  IF NEW.funding_transaction_id IS NULL THEN
    RAISE EXCEPTION 'budgets: a new budget must reference a funding transaction'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT user_id, type, status INTO tx FROM transactions WHERE id = NEW.funding_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'budgets: funding transaction does not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF tx.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'budgets: funding transaction belongs to a different user' USING ERRCODE = 'check_violation';
  END IF;
  IF tx.type <> 'budget_topup' THEN
    RAISE EXCEPTION 'budgets: funding transaction is not a budget_topup' USING ERRCODE = 'check_violation';
  END IF;
  IF tx.status <> 'success' THEN
    RAISE EXCEPTION 'budgets: funding transaction is not successful' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budgets_require_funding ON budgets;
CREATE TRIGGER trg_budgets_require_funding
  BEFORE INSERT ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_budget_funding();

-- The funding_transaction_id of an existing row may only be set once
-- (NULL -> value); it can never be swapped to a different transaction.
CREATE OR REPLACE FUNCTION forbid_budget_funding_change() RETURNS trigger AS $$
BEGIN
  IF OLD.funding_transaction_id IS NOT NULL
     AND NEW.funding_transaction_id IS DISTINCT FROM OLD.funding_transaction_id THEN
    RAISE EXCEPTION 'budgets: funding_transaction_id cannot be changed once set'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budgets_funding_immutable ON budgets;
CREATE TRIGGER trg_budgets_funding_immutable
  BEFORE UPDATE OF funding_transaction_id ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION forbid_budget_funding_change();
