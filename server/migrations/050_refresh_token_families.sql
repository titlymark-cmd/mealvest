-- 050 — Refresh-token rotation with reuse detection (M6)
--
-- Every login starts a token FAMILY. Each refresh atomically revokes the
-- presented token (revoked_reason='rotated', replaced_by=new id) and
-- issues the next token in the same family. Presenting an already-rotated
-- token again (outside a short grace window for benign concurrent
-- refreshes) is treated as theft: the whole family is revoked.
--
-- Existing rows: each becomes its own family (family_id = id), so every
-- current session keeps working.
--
-- Rollback: drop the added columns; rotation degrades to the old
-- behaviour (no reuse detection). No sessions are invalidated by rollback.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id      UUID,
  ADD COLUMN IF NOT EXISTS replaced_by    UUID,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;

ALTER TABLE refresh_tokens ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
