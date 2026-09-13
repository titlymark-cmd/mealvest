-- 014: orders
--
-- items is a JSONB snapshot of {itemId, name, unitPrice, quantity}
-- at order time — prices can change later on the hotel's menu, but
-- an already-placed order must always reflect what was actually
-- agreed and paid for.
--
-- qr_token is a random opaque string the app encodes into the QR
-- image directly (format "MEALVEST:1:<orderId>:<signature>" — see
-- qrService.ts). We do NOT store the signature here; it's derived
-- deterministically from orderId + a server-only secret so there's
-- nothing extra to keep in sync or leak from this table.
CREATE TABLE orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id                  UUID NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  items                     JSONB NOT NULL,
  amount                    NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payment_transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status                    TEXT NOT NULL DEFAULT 'pending_payment'
                              CHECK (status IN ('pending_payment', 'paid', 'ready', 'redeemed', 'cancelled', 'refunded')),
  redeemed                  BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at               TIMESTAMPTZ,
  redeemed_by_hotel_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_hotel_id ON orders (hotel_id, status);
CREATE INDEX idx_orders_payment_transaction_id ON orders (payment_transaction_id);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
