-- 027: PIN authentication (quick app-unlock)
--
-- Adds a 4-digit PIN, hashed the same way passwords are (bcrypt via
-- lib/password.ts — there is no separate PIN hashing scheme). The
-- PIN is NOT a replacement for the password: it re-authenticates an
-- EXISTING session on app reopen (see authService.verifyPinAndRefresh),
-- so a full password login is always still required at least once,
-- and always still available as a fallback if the PIN is locked out.
--
-- pin_failed_attempts counts consecutive wrong PINs since the last
-- success (or the last lockout). At 4, pin_locked_until is set
-- PIN_LOCKOUT_MINUTES into the future and the counter resets to 0,
-- so the account gets a fresh set of attempts once the lockout
-- expires — this is a TIMED lockout, not a permanent one; the
-- account itself is never suspended and existing sessions are never
-- revoked by a PIN lockout, only the PIN-unlock path is blocked
-- until it passes.
ALTER TABLE users
  ADD COLUMN pin_hash TEXT,
  ADD COLUMN pin_failed_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN pin_locked_until TIMESTAMPTZ;

ALTER TABLE users
  ADD CONSTRAINT chk_pin_failed_attempts_range CHECK (pin_failed_attempts BETWEEN 0 AND 4);
