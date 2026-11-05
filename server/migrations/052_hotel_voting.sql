-- 052: hotel voting system
-- Students (or public users) vote for hotels to partner with Mealvest.
-- One vote per phone number. OTP verification required.
-- When a hotel is approved, voters who chose it can be activated.

CREATE TABLE IF NOT EXISTS vote_otps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vote_otps_phone ON vote_otps (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS hotel_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL UNIQUE,
  hotel_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  voter_name      TEXT,
  profile_picture TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_votes_hotel ON hotel_votes (hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_votes_status ON hotel_votes (status);

CREATE TRIGGER trg_hotel_votes_updated_at
  BEFORE UPDATE ON hotel_votes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
