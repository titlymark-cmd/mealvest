-- 032: announcements — free-text broadcast messages an admin can post
-- from the admin dashboard. Shown as a dismissible popup to every
-- signed-in student/hotel user (see GET /api/announcements/active);
-- dismissal is tracked client-side per device, not server-side, since
-- "have I seen this" carries no authorization weight.
CREATE TABLE announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_announcements_active ON announcements (is_active, created_at DESC);

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
