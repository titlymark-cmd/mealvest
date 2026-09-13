-- 006: hotel_staff
-- Links a user (role = 'hotel_staff' or 'hotel_owner') to the hotel
-- they work for, with a permission_level scoped to that hotel. This
-- stays separate from users.role so a single hotel can eventually
-- have several staff accounts under one owner without needing a new
-- top-level role for every permission nuance.
CREATE TABLE hotel_staff (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  hotel_id          UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  permission_level  TEXT NOT NULL DEFAULT 'staff' CHECK (permission_level IN ('owner', 'staff')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_staff_hotel_id ON hotel_staff (hotel_id);
CREATE INDEX idx_hotel_staff_user_id ON hotel_staff (user_id);

CREATE TRIGGER trg_hotel_staff_updated_at
  BEFORE UPDATE ON hotel_staff
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
