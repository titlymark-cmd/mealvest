-- 041: savings withdrawal — MEALVEST platform fee + admin processing fields
--
-- Business rule change: when a student withdraws the unspent balance
-- of an ENDED plan (rollover/"savings"), MEALVEST keeps a platform fee
-- (10% by default, admin-configurable via platform_settings) and the
-- student receives the rest. Migration 020's
-- chk_student_gets_full_savings (student_amount = gross_savings)
-- encoded the old "100% to the student" rule and has to go; the new
-- constraint keeps the ledger honest the same way — the split must
-- always add up exactly to the gross figure, so no bug can quietly
-- lose or invent money.
--
-- Existing rows: platform_fee_amount defaults to 0 and their
-- student_amount already equals gross_savings, so they satisfy the new
-- constraint unchanged — nothing historical is reinterpreted.
ALTER TABLE savings_withdrawals DROP CONSTRAINT chk_student_gets_full_savings;

ALTER TABLE savings_withdrawals
  ADD COLUMN platform_fee_percent NUMERIC(5, 2)  NOT NULL DEFAULT 0 CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  ADD COLUMN platform_fee_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
  -- Admin processing trail (the actual M-Pesa send is done by an admin
  -- from the Payments screen; these record who closed the request and how).
  ADD COLUMN processed_at         TIMESTAMPTZ,
  ADD COLUMN processed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN payout_reference     TEXT,
  ADD COLUMN admin_note           TEXT;

ALTER TABLE savings_withdrawals
  ADD CONSTRAINT chk_withdrawal_split_adds_up CHECK (student_amount + platform_fee_amount = gross_savings);

-- Default fee. Admin-editable later through platform_settings, read by
-- budgetService.getWithdrawalFeePercent at withdrawal time and frozen
-- onto each row (platform_fee_percent), so changing it never
-- retroactively alters an already-recorded withdrawal.
INSERT INTO platform_settings (key, value) VALUES ('savings_withdrawal_fee_percent', '10')
ON CONFLICT (key) DO NOTHING;
