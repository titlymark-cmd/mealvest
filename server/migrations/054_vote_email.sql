-- 054: capture a voter's email alongside their phone.
-- The voting form now collects name, phone, email and a profile photo.
-- Phone stays the one-vote-per-person key (UNIQUE in migration 052); email
-- is stored for contact/notification once the hotel partners. It is
-- nullable so existing votes (phone-only) remain valid.
ALTER TABLE hotel_votes ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_hotel_votes_email ON hotel_votes (email);
