-- 028: Meal Boost — top up an existing active budget
--
-- Until now the only thing a Paystack payment could do was fund a
-- BRAND NEW budget (paymentService.activatePaymentIfNeeded ->
-- budgetService.createBudget). A student partway through a plan who
-- decides their original amount was too small had no way to add
-- money without waiting for the plan to end. This reuses the exact
-- same transactions/webhook/verify machinery — same idempotency
-- guard, same row-locking, same "never trust the client, always
-- re-verify against Paystack" — rather than a parallel payment path.
--
-- budget_id lets a boost transaction remember WHICH budget to credit
-- once payment is verified (the original plan-purchase flow doesn't
-- need this column — it creates the budget itself, there's nothing
-- to point at yet). Nullable, and only ever set for type='plan_boost'.
ALTER TABLE transactions
  ADD COLUMN budget_id UUID REFERENCES budgets(id);

CREATE INDEX idx_transactions_budget_id ON transactions (budget_id) WHERE budget_id IS NOT NULL;

-- Widen the type vocabulary the same way 017 widened `status` —
-- drop and recreate the named CHECK constraint.
ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('order_payment', 'budget_topup', 'refund', 'plan_boost'));
