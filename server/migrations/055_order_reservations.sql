-- 055: meal-pass reservations ("hold, settle on scan")
--
-- The meal QR scan is the ONLY confirmation of payment. When a student
-- generates a meal pass we now HOLD the amount instead of spending it:
--   * reserved_amount tracks money held by paid-but-unscanned passes.
--     It is NOT part of amount_spent / spent_today — those only move
--     when the hotel actually scans the QR (settlement).
--   * A hold is released (money "reorganizes" back) if the student
--     leaves the pass unscanned, via an explicit cancel, a timed sweep,
--     or the daily rollover.
--
-- orders.budget_id records which budget a hold is against, so the scan
-- can settle (or a cancel can release) the exact plan that was held.
-- reserved_at is the hold timestamp the sweep uses for its TTL.
--
-- Legacy orders that were already 'paid' under the old deduct-at-pay
-- model have budget_id = NULL, so the scan skips settlement for them and
-- never double-deducts.

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS reserved_amount NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (reserved_amount >= 0);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

-- The sweep looks up outstanding holds by (status, reserved_at).
CREATE INDEX IF NOT EXISTS idx_orders_held ON orders (status, reserved_at)
  WHERE status = 'paid' AND budget_id IS NOT NULL;
