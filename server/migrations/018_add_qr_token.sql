-- 018: qr_token on orders
--
-- Migration 014's comments describe qr_token but the column was
-- never actually added — closing that gap. Stores the compact,
-- signed token per order: "MEALVEST:1:<orderId>:<signature>". The
-- signature is HMAC'd server-side (see lib/qr.ts) using
-- QR_SIGNING_SECRET, which never leaves the server.
ALTER TABLE orders
  ADD COLUMN qr_token TEXT;

CREATE UNIQUE INDEX idx_orders_qr_token ON orders (qr_token) WHERE qr_token IS NOT NULL;
