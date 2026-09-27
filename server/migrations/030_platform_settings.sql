-- 030: platform_settings — a small generic key/value table for
-- admin-configurable, platform-wide values that don't warrant their
-- own dedicated table. First use: the Customer Care phone number
-- shown to students, which used to have no admin-editable home (each
-- hotel has its own `helpline` column, but that's per-hotel contact
-- info, not a MealVest-wide support number).
CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value) VALUES ('customer_care_phone', '0798180082');
