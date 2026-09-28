-- 034: pending_login_tokens — the intermediate state between
-- "password verified" and "fully authenticated" now that a 4-digit
-- PIN is a mandatory second factor on every password login, not just
-- an app-relaunch quick-unlock. Deliberately an opaque random token
-- looked up server-side (same pattern as refresh_tokens), NOT a JWT —
-- it's sent only in a request BODY, never as a Bearer header, so it
-- can never be mistaken for a real access token by requireAuth even
-- by accident. Short-lived and single-use (deleted the moment PIN
-- verification succeeds); a wrong PIN does NOT delete it, so the
-- student gets their real 4 attempts against the same pending login.
CREATE TABLE pending_login_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_login_tokens_expires ON pending_login_tokens (expires_at);
