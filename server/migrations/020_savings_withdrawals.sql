-- 020: order commission split + savings withdrawals ledger
--
-- Commission on ORDERS (the per-meal 10% cap) is computed and frozen
-- onto the order at redemption time, funded out of what the hotel
-- earns per meal — completely unrelated to student savings.
ALTER TABLE orders
  ADD COLUMN commission_amount NUMERIC(10, 2),
  ADD COLUMN hotel_amount      NUMERIC(10, 2);

-- One row per withdrawal request/execution.
--
-- CORRECTED MODEL (per explicit instruction): gross_savings and
-- student_amount are ALWAYS equal — the student's unspent budget
-- balance is 100% theirs, full stop. hotel_incentive_amount is a
-- SEPARATE, additive, platform/hotel-funded figure — never a
-- subtraction. The CHECK constraint makes this impossible to violate
-- even by a future bug.
CREATE TABLE savings_withdrawals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_id              UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  hotel_id               UUID REFERENCES hotels(id) ON DELETE SET NULL,
  gross_savings          NUMERIC(10, 2) NOT NULL CHECK (gross_savings >= 0),
  student_amount         NUMERIC(10, 2) NOT NULL CHECK (student_amount >= 0),
  hotel_incentive_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (hotel_incentive_amount >= 0),
  payout_method          TEXT CHECK (payout_method IN ('mpesa', 'bank')),
  payout_destination     TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_student_gets_full_savings CHECK (student_amount = gross_savings)
);

CREATE UNIQUE INDEX idx_savings_withdrawals_budget_id ON savings_withdrawals (budget_id);
CREATE INDEX idx_savings_withdrawals_user_id ON savings_withdrawals (user_id);

CREATE TRIGGER trg_savings_withdrawals_updated_at
  BEFORE UPDATE ON savings_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
