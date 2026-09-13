-- 002: shared trigger function
-- Every table below gets an `updated_at` column that this trigger
-- keeps current automatically, so application code never has to
-- remember to set it by hand.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
