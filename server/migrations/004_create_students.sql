-- 004: students
-- One row per student, 1:1 with a users row where role = 'student'.
CREATE TABLE students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  institution        TEXT,               -- e.g. "Maseno University" for the pilot
  admission_number   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_user_id ON students (user_id);

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
