-- 010: menu_items
-- A hotel's food items, browsable by students before any budget/
-- ordering logic exists. Kept intentionally simple for now — no
-- pricing rules, availability windows, etc. beyond a basic
-- available flag; the budget engine (student-facing ordering rules)
-- is separate, later work.
CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category      TEXT NOT NULL DEFAULT 'other'
                  CHECK (category IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'other')),
  available     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_hotel_id ON menu_items (hotel_id);
CREATE INDEX idx_menu_items_hotel_category ON menu_items (hotel_id, category);

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
