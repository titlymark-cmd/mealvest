-- 021: meal plans catalog
--
-- Closes the gap flagged when Paystack was first built: there was no
-- server-side price catalog, only a min/max-validated free-form
-- amount. This ADDS a real catalog alongside that — planId is
-- optional on budget creation; passing one means the price/duration
-- are looked up from THIS table (server-authoritative, the frontend
-- cannot override them), while omitting it keeps the existing
-- custom-amount flow working exactly as before (nothing removed).
CREATE TABLE plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  price             NUMERIC(10, 2) NOT NULL CHECK (price > 0),
  duration_days     INTEGER NOT NULL CHECK (duration_days > 0),
  daily_allocation  NUMERIC(10, 2) NOT NULL CHECK (daily_allocation > 0),
  rollover_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Budgets optionally reference the plan they were created from — a
-- budget created via the pre-existing custom-amount path simply has
-- plan_id = NULL, which is fully valid and unchanged behavior.
ALTER TABLE budgets ADD COLUMN plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;

INSERT INTO plans (name, price, duration_days, daily_allocation, rollover_enabled, description) VALUES
  ('Comrade Basic', 2000, 30, 66.67, TRUE, 'Light daily allowance, maximum savings.'),
  ('Hustler Plan',  5000, 30, 166.67, TRUE, 'Comfortable daily meals, our most popular pick.'),
  ('Fiti Plan',     8000, 30, 266.67, TRUE, 'Balanced plan for an active student schedule.'),
  ('VIP Comrade',  12000, 30, 400.00, TRUE, 'Generous daily credit, eat without thinking twice.');
