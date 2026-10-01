-- 038: hotel payouts — the real "money leaves the platform to a
-- hotel" event, deliberately separate from PAYMENT RECEIVED
-- (transactions table) and from a redeemed order's commission split
-- (orders.hotel_amount, which is just bookkeeping on what a hotel is
-- OWED, not proof anything was sent). Same admin-triggered-batch
-- pattern already used for student savings_withdrawals (020) — the
-- only other real money-leaves-the-platform flow in this codebase —
-- rather than firing one tiny Paystack Transfer per KSh-18 meal.
--
-- Explicit status enum (not a boolean), matching every other
-- financial table in this schema.
CREATE TABLE hotel_payouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id               UUID NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  amount                 NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'processing', 'successful', 'failed')),
  provider               TEXT NOT NULL DEFAULT 'paystack',
  -- Our own reference, sent as Paystack's `reference` on the transfer
  -- call — the same idempotency pattern as transactions.provider_reference,
  -- so a retried "Pay out" click can never create a second real transfer.
  transfer_reference     TEXT NOT NULL UNIQUE,
  recipient_code         TEXT, -- Paystack's transfer-recipient code used
  transfer_code          TEXT, -- Paystack's own transfer code/id, once initiated
  failure_reason         TEXT,
  initiated_by_admin_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_payouts_hotel ON hotel_payouts (hotel_id, created_at DESC);

CREATE TRIGGER trg_hotel_payouts_updated_at
  BEFORE UPDATE ON hotel_payouts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Which payout a redeemed order's earnings were included in — NULL
-- means "redeemed but not yet paid out." This is what makes a payout
-- batch exactly-once: an order can be claimed by only one payout ever
-- (set inside the same transaction that creates the hotel_payouts
-- row), so two "Pay out" clicks racing each other can never both
-- claim the same order's hotel_amount.
ALTER TABLE orders
  ADD COLUMN payout_id UUID REFERENCES hotel_payouts(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_unpaid_by_hotel ON orders (hotel_id) WHERE redeemed = true AND payout_id IS NULL;

-- Caches the Paystack transfer-recipient code for a hotel's current
-- settlement details so a payout doesn't recreate (and re-verify) a
-- recipient on Paystack's side every single time. Cleared (not kept
-- stale) whenever a hotel's settlement details change — see
-- hotelApplicationService's existing payment-detail-change path.
ALTER TABLE hotels
  ADD COLUMN paystack_recipient_code TEXT;
