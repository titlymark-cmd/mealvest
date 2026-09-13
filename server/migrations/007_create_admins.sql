-- 007: admins
-- Platform-level MEALVEST staff (role = 'mealvest_admin'). Kept as its own
-- table rather than a boolean flag on users so admin-specific fields
-- (e.g. department, permissions scope) can grow later without
-- touching the core users table.
CREATE TABLE admins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
