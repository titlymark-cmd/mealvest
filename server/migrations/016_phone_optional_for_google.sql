-- 016: phone_number optional for Google-authenticated accounts
--
-- Migration 009 made phone_number NOT NULL, reasoning that phone is
-- the primary identifier for password-based sign-up. Google Sign-In
-- doesn't provide a phone number at all, so that blanket NOT NULL
-- would make Google sign-up impossible without an extra forced
-- "enter your phone" step in between — which defeats the point of
-- "sign in with one tap".
--
-- Fix: phone_number is still REQUIRED for password-provider accounts
-- (enforced by this CHECK, not by NOT NULL), but optional for
-- google-provider accounts. A Google user can add their phone number
-- later via PATCH /api/student/profile once they're signed in — this
-- is a nullable-until-provided field for them, not a missing one.
ALTER TABLE users
  ALTER COLUMN phone_number DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT chk_users_phone_required_for_password
  CHECK (auth_provider != 'password' OR phone_number IS NOT NULL);

-- phone_number's uniqueness (migration 009) already tolerates
-- multiple NULLs in Postgres (NULL is never considered equal to
-- another NULL for a unique index), so no change needed there —
-- several Google accounts can each have no phone number set yet
-- without violating uniqueness.
