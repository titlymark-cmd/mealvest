-- 042: hotel reviews — one rating + optional comment per student per hotel
--
-- Eligibility is enforced in application code (reviews.controller):
-- a student may review a hotel only after at least one REDEEMED order
-- there, i.e. after actually eating a meal they paid for. One row per
-- (hotel, student): posting again updates the existing review rather
-- than stacking duplicates, so a single student can never skew a
-- hotel's average by repeating themselves.
CREATE TABLE hotel_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hotel_reviews_hotel_user UNIQUE (hotel_id, user_id)
);

CREATE INDEX idx_hotel_reviews_hotel_created ON hotel_reviews (hotel_id, created_at DESC);
CREATE INDEX idx_hotel_reviews_user ON hotel_reviews (user_id);

CREATE TRIGGER trg_hotel_reviews_updated_at
  BEFORE UPDATE ON hotel_reviews
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
