-- 005: hotels
-- The partner business itself — separate from any individual user,
-- since a hotel can have multiple staff accounts (see hotel_staff).
CREATE TABLE hotels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  location         TEXT,
  contact_phone    TEXT,
  contact_email    TEXT,
  payout_method    TEXT CHECK (payout_method IN ('bank', 'mpesa')),
  payout_account   TEXT,               -- bank account number or M-Pesa till/paybill
  status           TEXT NOT NULL DEFAULT 'pending_verification'
                     CHECK (status IN ('pending_verification', 'active', 'suspended')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotels_status ON hotels (status);

CREATE TRIGGER trg_hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
