-- 008: refresh_tokens
--
-- Refresh tokens are never stored as the raw value the client holds —
-- only a SHA-256 hash of it, same principle as password_hash. If this
-- table ever leaked, the leaked hashes are useless without the
-- original token. Lookups on refresh always hash the incoming token
-- and compare hash-to-hash.
--
-- One row per issued refresh token (not per user) so multiple
-- devices/sessions can be logged in simultaneously, and any single
-- device can be logged out (revoke one row) without killing every
-- other session.
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,             -- set on logout; NULL = still valid
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

-- Cheap cleanup helper — call periodically (e.g. a daily cron/Cloud
-- Scheduler hit against a small admin endpoint) to keep this table
-- from growing unbounded with expired rows. Not wired to anything
-- automatically yet; that's an operational task, not a schema one.
-- DELETE FROM refresh_tokens WHERE expires_at < now() - INTERVAL '30 days';
