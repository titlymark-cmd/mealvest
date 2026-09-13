-- 013: transactions
--
-- The payment ledger. Every money-moving event gets a row here
-- BEFORE Safaricom is contacted (status starts 'pending'), and the
-- row is only ever moved to 'success'/'failed' by the M-Pesa
-- callback handler — never by the STK-push-initiation endpoint
-- itself, since STK acceptance is not proof of payment.
--
-- idempotency_key is UNIQUE and is how we protect against a student
-- double-tapping "Pay" from creating two STK pushes for the same
-- order: the client sends the same key on retry, and a second
-- request with an already-used key returns the existing pending
-- transaction instead of creating a new one.
CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id              UUID, -- FK added after orders table exists (migration 014)
  hotel_id              UUID REFERENCES hotels(id) ON DELETE SET NULL,
  amount                NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  phone_number          TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'order_payment'
                          CHECK (type IN ('order_payment', 'budget_topup', 'refund')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled', 'expired')),
  idempotency_key       TEXT NOT NULL UNIQUE,
  merchant_request_id   TEXT,
  checkout_request_id   TEXT,
  mpesa_receipt_number  TEXT,
  result_code           INTEGER,
  result_description    TEXT,
  transaction_date      TEXT, -- raw Daraja TransactionDate string, kept as-is for audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_checkout_request_id ON transactions (checkout_request_id);
CREATE UNIQUE INDEX idx_transactions_mpesa_receipt ON transactions (mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
