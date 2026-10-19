-- 045 — Atomic payment activation + reconciliation bookkeeping (H1)
--
-- activated_at is set IN THE SAME database transaction that creates or
-- credits the budget. "status = 'success' AND activated_at IS NULL"
-- therefore means "the provider confirmed the money but the budget was
-- never credited" — exactly the state the reconciliation cron repairs.
--
-- Backfill policy: every transaction that is ALREADY 'success' is
-- marked activated (activated_at = updated_at). Under the old code
-- activation normally ran right after the status flip, and we cannot
-- prove from the data which (if any) of those follow-up steps failed.
-- Leaving them NULL would make the cron re-credit every historical
-- payment a second time. Historical rows that look unactivated are
-- reported by scripts/auditUnpaidBudgets.js for manual review instead.
--
-- Rollback / forward recovery:
--   ALTER TABLE transactions DROP COLUMN activated_at, DROP COLUMN activation_attempts,
--     DROP COLUMN activation_error, DROP COLUMN needs_review, DROP COLUMN reconcile_claimed_until;
--   (columns only; no balances are touched)

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS activated_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_error        TEXT,
  ADD COLUMN IF NOT EXISTS needs_review            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconcile_claimed_until TIMESTAMPTZ;

UPDATE transactions
   SET activated_at = updated_at
 WHERE status = 'success' AND activated_at IS NULL;

-- A transaction can only be "activated" if it actually succeeded.
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_activated_requires_success;
ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_activated_requires_success
  CHECK (activated_at IS NULL OR status = 'success');

-- Reconciliation work queue: unactivated provider payments.
CREATE INDEX IF NOT EXISTS idx_transactions_unactivated
  ON transactions (created_at)
  WHERE activated_at IS NULL AND needs_review = false
    AND type IN ('budget_topup', 'plan_boost')
    AND status IN ('pending', 'processing', 'success');
