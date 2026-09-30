-- 037: notification system — personal, per-user notifications with
-- push/SMS/in-app delivery tracking. Deliberately separate from the
-- existing `announcements` table (032): that one is a simple global
-- dismissible popup with no per-user state, targeting, or delivery
-- channels; this is the real thing the notification center and
-- push/SMS system read and write. announcements keeps working
-- completely unchanged.
--
-- No RLS here (or anywhere else in this schema) — this app connects
-- to Postgres via a raw `pg` pool over DATABASE_URL, never through
-- Supabase's PostgREST/Auth layer, so RLS policies would be inert:
-- the app's DB role bypasses them entirely. Authorization is enforced
-- at the Express layer (requireAuth/requireRole + scoping every query
-- by req.user.id), exactly like every other table in this codebase —
-- see server/src/controllers/notifications.controller.ts.

-- One row per registered device/browser. push_token is the natural
-- upsert key (not user_id) so registering a device NEVER overwrites
-- another device's row for the same user — that's the actual
-- mechanism behind "one user, multiple devices" and "don't overwrite
-- another device's registration."
CREATE TABLE notification_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token    TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL DEFAULT 'web',
  browser       TEXT,
  device_label  TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_devices_user ON notification_devices (user_id) WHERE enabled = true;

CREATE TRIGGER trg_notification_devices_updated_at
  BEFORE UPDATE ON notification_devices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- One row per user, created on first access (see
-- notificationPreferencesModel.getOrCreate) rather than at
-- registration time, so existing accounts get sane defaults
-- automatically without a backfill migration.
CREATE TABLE notification_preferences (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled      BOOLEAN NOT NULL DEFAULT true,
  sms_enabled       BOOLEAN NOT NULL DEFAULT false,
  meal_reminders    BOOLEAN NOT NULL DEFAULT true,
  payment_updates   BOOLEAN NOT NULL DEFAULT true,
  wallet_alerts     BOOLEAN NOT NULL DEFAULT true,
  announcements     BOOLEAN NOT NULL DEFAULT true,
  security_alerts   BOOLEAN NOT NULL DEFAULT true,
  reminder_time     TIME NOT NULL DEFAULT '12:00:00',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- The in-app notification center's actual rows. dedupe_key lets a
-- caller opt into idempotency (e.g. 'payment_success:<reference>') so
-- a retried webhook/API call can't create a second notification for
-- the same underlying event — NULL is allowed to repeat freely for
-- event types that don't need it (a partial unique index only
-- constrains non-null values).
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  deep_link   TEXT,
  dedupe_key  TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read = false;
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Delivery attempt log — one row per channel per notification, so
-- "why didn't this push/SMS arrive" is answerable without guessing.
-- Never stores provider secrets, only provider_message_id (their
-- reference, safe to keep) and a short error string.
CREATE TABLE notification_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id       UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('push', 'sms', 'in_app')),
  status                TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_message_id   TEXT,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at               TIMESTAMPTZ
);

CREATE INDEX idx_notification_deliveries_notification ON notification_deliveries (notification_id);
