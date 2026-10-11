-- 040: Cyzora as a payment/payout provider
--
-- Additive only, same approach as 017 (Paystack alongside Daraja):
-- the transactions ledger keeps every existing column; this just lets
-- `provider` carry 'cyzora' and records WHICH Cyzora flow created a
-- row. That matters because Cyzora verifies the two flows through two
-- different endpoints — an STK push is read back with
-- GET /charges/{id} (Cyzora's charge id), a hosted-checkout session
-- with GET /transactions/verify/{reference} (Cyzora's session
-- reference). Both identifiers live in the existing
-- provider_transaction_id column (set at initialize time for Cyzora
-- rows, where Paystack rows only set it at verify time);
-- provider_channel says which endpoint that identifier belongs to.
ALTER TABLE transactions DROP CONSTRAINT transactions_provider_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_provider_check
  CHECK (provider IN ('daraja', 'paystack', 'cyzora'));

ALTER TABLE transactions
  ADD COLUMN provider_channel TEXT CHECK (provider_channel IN ('stk_push', 'hosted_checkout'));

-- Webhook lookups arrive keyed by Cyzora's own id/reference, not ours.
CREATE INDEX idx_transactions_provider_transaction_id
  ON transactions (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- hotel_payouts.provider (038) has no CHECK constraint, so 'cyzora'
-- needs no schema change there. transfer_code holds Cyzora's payout
-- id for Cyzora rows (Paystack's transfer code for Paystack rows) and
-- is what payout.paid / payout.failed webhooks are matched on.
CREATE INDEX idx_hotel_payouts_transfer_code
  ON hotel_payouts (provider, transfer_code)
  WHERE transfer_code IS NOT NULL;
