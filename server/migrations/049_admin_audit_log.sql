-- 049 — Administrative audit log + dual control for held payouts (M8)
--
-- admin_audit_log is APPEND-ONLY: a trigger rejects UPDATE and DELETE for
-- every role, including the application's own database role, so a
-- compromised admin session (or a bug) cannot rewrite history. Rows hold
-- non-sensitive metadata only — never passwords, PINs, tokens or keys.
--
-- Dual control: a payout held in 'review' (over a limit) must be approved
-- by a DIFFERENT administrator from the one who initiated it. Enforced
-- here in the database as well as in code, so two simultaneous requests
-- cannot bypass it.
--
-- Rollback: DROP TRIGGER/FUNCTION below; the log table may be kept.
-- Never delete audit rows.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role     TEXT,
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  outcome        TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log (actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();

-- TRUNCATE bypasses row triggers; block it too.
DROP TRIGGER IF EXISTS trg_admin_audit_log_no_truncate ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_truncate
  BEFORE TRUNCATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_log_mutation();

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON admin_audit_log FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON admin_audit_log FROM authenticated'; END IF;
END $$;

-- Dual control on review -> approved.
CREATE OR REPLACE FUNCTION enforce_payout_dual_control() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'review' AND NEW.status = 'approved' THEN
    IF NEW.approved_by_admin_id IS NULL THEN
      RAISE EXCEPTION 'hotel_payouts: approval requires an approving administrator' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.initiated_by_admin_id IS NOT NULL AND NEW.approved_by_admin_id = OLD.initiated_by_admin_id THEN
      RAISE EXCEPTION 'hotel_payouts: the initiating administrator cannot approve their own payout'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hotel_payouts_dual_control ON hotel_payouts;
CREATE TRIGGER trg_hotel_payouts_dual_control
  BEFORE UPDATE ON hotel_payouts
  FOR EACH ROW EXECUTE FUNCTION enforce_payout_dual_control();
