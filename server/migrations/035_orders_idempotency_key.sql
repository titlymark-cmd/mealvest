-- 035: idempotency_key on orders — mirrors transactions.idempotency_key
-- (migration 013). The meal-ordering flow (MealPassScreen) creates an
-- order automatically on mount with no user-facing "Order" button to
-- debounce; any retry after a failed payOrder (or the user navigating
-- back and re-selecting the same item) previously called createOrder
-- again with zero deduplication, producing repeated
-- "<Hotel> / <Item> / Pending Payment" rows for what was really one
-- attempt. The client now sends a stable key per order attempt
-- (cleared only once the order is actually paid); the server returns
-- the existing row for a repeated key instead of inserting a new one.
ALTER TABLE orders ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
