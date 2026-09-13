-- 026: daily allowance rollover ("Boss Meals" style carry-forward)
--
-- Before this migration, `daily_allowance` was informational only —
-- deductFromBudget checked total remaining_amount and nothing else,
-- so a student could spend an entire multi-week budget in one
-- sitting. That means there was nothing to roll over FROM: rollover
-- only means something once spending is actually capped per day.
--
-- This adds that real daily cap, plus the carry-forward:
--   spent_today    — how much of TODAY's allowance has been used
--   last_spend_date — which calendar day spent_today applies to
--   banked_amount  — accumulated unused allowance from past days,
--                     added on top of today's allowance automatically
ALTER TABLE budgets
  ADD COLUMN spent_today     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (spent_today >= 0),
  ADD COLUMN last_spend_date DATE,
  ADD COLUMN banked_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (banked_amount >= 0);
