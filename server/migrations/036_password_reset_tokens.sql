-- 036: password_reset_tokens — same pattern as 034's pending_login_tokens:
-- an opaque random token, hashed at rest, looked up server-side, NOT a
-- JWT. Sent only inside an emailed link's query string, never as a
-- Bearer header, so it can never be mistaken for a real access token.
-- Single-use (deleted the moment a reset succeeds) and short-lived.
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens (expires_at);
