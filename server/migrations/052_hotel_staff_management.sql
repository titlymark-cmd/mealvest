-- 052 — Hotel staff management (owner-created staff accounts)
--
-- hotel_staff already links a users row (role 'hotel_staff' or 'hotel_owner')
-- to a hotel. This adds the lifecycle the owner needs to manage staff:
--
--   is_active       — FALSE = access removed by the owner. Enforced in the auth
--                     middleware, login, PIN unlock and token refresh. This is a
--                     SEPARATE flag from users.account_status ('suspended' stays
--                     an admin-only action an owner can never undo).
--   deactivated_at  — when access was removed.
--   deactivated_by  — which user removed it (kept for audit; SET NULL if that
--                     user is ever deleted so history is preserved).
--   invited_by      — the owner who created the account.
--   activated_at    — NULL while the invite is still pending (the staff member has
--                     not yet set a password); set when they redeem the invite link.
--
-- Nothing is ever hard-deleted: orders, redemptions and audit rows keep pointing at
-- the staff user. Existing rows (owners and any pre-existing staff) are treated as
-- active and already activated, so nobody is locked out by this migration.
--
-- Rollback (also DROP TABLE hotel_staff_events):
--   ALTER TABLE hotel_staff DROP CONSTRAINT IF EXISTS hotel_staff_owner_always_active;
--   ALTER TABLE hotel_staff DROP COLUMN is_active, DROP COLUMN deactivated_at,
--     DROP COLUMN deactivated_by, DROP COLUMN invited_by, DROP COLUMN activated_at;

ALTER TABLE hotel_staff
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at   TIMESTAMPTZ;

UPDATE hotel_staff SET activated_at = created_at WHERE activated_at IS NULL;

-- An owner row can never be deactivated, even by a bug or a direct UPDATE.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotel_staff_owner_always_active') THEN
    ALTER TABLE hotel_staff
      ADD CONSTRAINT hotel_staff_owner_always_active CHECK (permission_level <> 'owner' OR is_active);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hotel_staff_hotel_active ON hotel_staff (hotel_id, is_active);

-- Audit trail of staff-management actions. Rows outlive the staff account
-- (staff_user_id / actor_user_id go NULL if a user were ever hard-deleted by an
-- admin; the history itself is never removed with them).
CREATE TABLE IF NOT EXISTS hotel_staff_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  staff_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('created', 'invite_resent', 'deactivated', 'reactivated')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hotel_staff_events_hotel ON hotel_staff_events (hotel_id, created_at DESC);

-- Same lockdown as every other public table (see 044): RLS on, no direct API-role access.
ALTER TABLE hotel_staff_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON hotel_staff_events FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON hotel_staff_events FROM authenticated'; END IF;
END $$;
