-- 048 — Email & phone verification lifecycle (findings H7 full, M3)
--
-- verification_tokens stores ONLY a hash of each secret (sha256 for
-- emailed link tokens; HMAC-SHA256 with a server secret for 6-digit SMS
-- codes, so a database leak can't be brute-forced offline). Tokens are
-- single-use (consumed_at), expire, and are bound to the exact contact
-- value they were issued for (`target`), so changing an email/phone
-- after requesting a token makes that token useless.
--
-- Legacy accounts: email_verified is left exactly as it is (Google
-- accounts were already set from Google's verified claim). phone_verified
-- starts FALSE for everyone — nobody is marked verified without proof.
-- No operation is blocked on verification by default (see
-- REQUIRE_VERIFIED_PHONE_FOR_WITHDRAWAL), so no existing user is locked out.
--
-- Rollback: DROP TABLE verification_tokens; ALTER TABLE users DROP COLUMN
-- phone_verified, DROP COLUMN email_verified_at, DROP COLUMN phone_verified_at.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS verification_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
  target       TEXT NOT NULL,           -- the normalized email / 254… phone this token proves
  token_hash   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_tokens_hash ON verification_tokens (channel, token_hash);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_user ON verification_tokens (user_id, channel, created_at DESC);

ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON verification_tokens FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON verification_tokens FROM authenticated'; END IF;
END $$;

-- Password reset tokens: single use is now enforced by deleting ALL of a
-- user's reset tokens when one is redeemed or a new one is requested
-- (code). Also protect the table with RLS (created before 044 ran: 044
-- already covered it; this is a no-op safety net).
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
