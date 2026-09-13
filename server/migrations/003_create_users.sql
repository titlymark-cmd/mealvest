-- 003: users
--
-- DESIGN DECISION — one shared `users` table, not four separate ones.
-- Justification: every role (student, hotel_staff, hotel_owner,
-- mealvest_admin) authenticates the same way — email + password, one
-- session/token system, one place to check "does this email already
-- exist" and "is this account active". Splitting auth across four
-- tables would mean four places to enforce uniqueness, four places
-- to hash/check passwords, and four login code paths. Instead:
-- `users` owns identity + auth + role; role-specific profile data
-- (full name, institution, hotel assignment, etc.) lives in its own
-- table keyed by user_id. This is the standard "single identity
-- table + role profile tables" pattern.
--
-- Password handling: password_hash stores a bcrypt/argon2 hash only,
-- set by the Day 2 auth layer — this migration does not seed any
-- plaintext or hashing logic itself.

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  phone_number     TEXT,
  password_hash    TEXT,                  -- NULL for OAuth-only accounts (Day 2)
  role             TEXT NOT NULL CHECK (role IN ('student', 'hotel_staff', 'hotel_owner', 'mealvest_admin')),
  auth_provider    TEXT NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password', 'google')),
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  account_status   TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'pending_verification', 'suspended')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive email lookups are the hottest query path in auth
-- (login, duplicate-signup checks) — index the lowercased form.
CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));
CREATE INDEX idx_users_role ON users (role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
