-- 017: multi-provider payment support
--
-- Additive only — every existing Daraja-oriented column
-- (idempotency_key, checkout_request_id, mpesa_receipt_number, etc.)
-- is untouched. This adds what's needed for Paystack to sit
-- alongside Daraja in the same ledger table, per the "reuse the
-- existing transactions table" instruction.
ALTER TABLE transactions
  ADD COLUMN provider TEXT NOT NULL DEFAULT 'daraja' CHECK (provider IN ('daraja', 'paystack')),
  ADD COLUMN provider_reference TEXT,
  ADD COLUMN provider_transaction_id TEXT,
  ADD COLUMN number_of_days INTEGER;

-- One reference per provider call — this is the idempotency
-- backbone for Paystack the same way idempotency_key already is for
-- Daraja. Partial index (WHERE NOT NULL) so Daraja rows, which don't
-- populate this column, never collide against each other on NULL.
CREATE UNIQUE INDEX idx_transactions_provider_reference
  ON transactions (provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Statuses already support the shared set this spec calls for
-- (pending/processing/success/failed/cancelled) via migration 013's
-- CHECK constraint — 'expired' was already included too, and
-- 'refunded' is the only one missing. Add it now so both providers
-- can use the exact same status vocabulary.
ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled', 'expired', 'refunded'));
