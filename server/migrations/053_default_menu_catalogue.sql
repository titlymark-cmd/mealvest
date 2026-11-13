-- 053: default_menu_catalogue
-- A central default menu catalogue for hotel onboarding and menu bootstrapping.
-- Hotels receive copies of these rows when they are created or when their own menu is empty,
-- so central catalogue updates never overwrite or mutate the hotel's own menu data.

CREATE TABLE default_menu_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE default_menu_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL
               CHECK (category IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'other')),
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url    TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_default_menu_items_category
  ON default_menu_items (category, is_active, sort_order, name);

CREATE TRIGGER trg_default_menu_categories_updated_at
  BEFORE UPDATE ON default_menu_categories
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_default_menu_items_updated_at
  BEFORE UPDATE ON default_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

INSERT INTO default_menu_categories (slug, label, sort_order)
VALUES
  ('breakfast', 'Breakfast', 1),
  ('lunch', 'Lunch', 2),
  ('dinner', 'Dinner', 3),
  ('snacks', 'Snacks', 4),
  ('drinks', 'Drinks', 5),
  ('other', 'Other', 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'breakfast', 'Tea', 'Hot Kenyan chai', 30.00, NULL, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'breakfast' AND name = 'Tea');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'breakfast', 'Chapati', 'Soft layered chapati', 30.00, NULL, 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'breakfast' AND name = 'Chapati');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'breakfast', 'Egg + Mandazi', 'Boiled egg with mandazi', 50.00, NULL, 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'breakfast' AND name = 'Egg + Mandazi');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'lunch', 'Beans + Ugali', 'Home-style beans, ugali', 120.00, NULL, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'lunch' AND name = 'Beans + Ugali');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'lunch', 'Beef + Ugali', 'Beef stew, ugali', 180.00, NULL, 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'lunch' AND name = 'Beef + Ugali');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'lunch', 'Chicken + Rice', 'Grilled chicken, rice, kachumbari', 250.00, NULL, 3, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'lunch' AND name = 'Chicken + Rice');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'dinner', 'Rice + Beans', 'Rice, beans, greens', 130.00, NULL, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'dinner' AND name = 'Rice + Beans');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'dinner', 'Chicken + Ugali', 'Chicken stew, ugali', 230.00, NULL, 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'dinner' AND name = 'Chicken + Ugali');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'snacks', 'Samosa', 'Crispy savoury pastry', 60.00, NULL, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'snacks' AND name = 'Samosa');

INSERT INTO default_menu_items (category, name, description, price, image_url, sort_order, is_active)
SELECT 'drinks', 'Fresh Juice', 'Seasonal fruit juice', 70.00, NULL, 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM default_menu_items WHERE category = 'drinks' AND name = 'Fresh Juice');
