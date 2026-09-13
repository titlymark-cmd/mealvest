-- 011: budgets
--
-- One student may have at most one ACTIVE budget at a time (enforced
-- in application code, not a DB constraint, since "active" is a
-- value not a boolean flag — a partial unique index would work too,
-- but the app-level check keeps the logic visible in one place:
-- budgetService.ts).
--
-- dailyAllowance is stored but should be treated as a CACHE of a
-- server-computed value (remainingAmount / remaining days), not a
-- source of truth the client can set — see budgetService.ts
-- `computeDailyAllowance`. It's persisted so simple reads don't need
-- to recompute, but every write recalculates it.
CREATE TABLE budgets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id          UUID REFERENCES hotels(id) ON DELETE SET NULL,
  total_amount      NUMERIC(10, 2) NOT NULL CHECK (total_amount > 0),
  remaining_amount  NUMERIC(10, 2) NOT NULL CHECK (remaining_amount >= 0),
  amount_spent      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_spent >= 0),
  daily_allowance   NUMERIC(10, 2) NOT NULL,
  number_of_days    INTEGER NOT NULL CHECK (number_of_days > 0),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'suspended', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budgets_user_id ON budgets (user_id);
CREATE INDEX idx_budgets_user_status ON budgets (user_id, status);

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
