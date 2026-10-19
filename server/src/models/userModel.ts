import { pool } from "../config/db";
import { Role } from "../types/roles";

export interface UserRow {
  id: string;
  email: string;
  phone_number: string | null;
  password_hash: string | null;
  google_id: string | null;
  role: Role;
  auth_provider: "password" | "google";
  email_verified: boolean;
  account_status: "active" | "pending_verification" | "suspended";
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Thin query helpers only — no business logic (password hashing,
 * validation) here. That belongs in Day 2's auth service layer, kept
 * separate from raw data access on purpose.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
  return result.rows[0] ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE google_id = $1", [googleId]);
  return result.rows[0] ?? null;
}

/**
 * Looks a user up by whichever identifier was given — email or
 * phone number, in whatever normalized/raw form it arrives in. Used
 * by both login (accepts either) and duplicate-account checks at
 * registration (must catch a clash on EITHER identifier, since both
 * are unique constraints per migration 003/009).
 */
export async function findUserByEmailOrPhone(identifier: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR phone_number = $1",
    [identifier]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

/** Sets/replaces the caller's PIN and clears any prior lockout state — a fresh PIN means a fresh start. */
export async function setUserPin(userId: string, pinHash: string): Promise<void> {
  await pool.query(
    `UPDATE users SET pin_hash = $1, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now()
     WHERE id = $2`,
    [pinHash, userId]
  );
}

/**
 * PIN brute-force protection (finding H4).
 *
 * The old flow read the lock state, ran bcrypt (~200ms), THEN recorded
 * a failure — so N parallel guesses all passed the lock check. Now an
 * attempt is RESERVED atomically before the comparison: the counter is
 * incremented in the same UPDATE that checks "not locked and below the
 * limit". At most `maxAttempts` comparisons can ever be in flight or
 * completed per lockout window, regardless of concurrency.
 *
 * Returns the reserved count (failures so far including this attempt)
 * and the hash to compare against, or null when no attempt may be made.
 */
export async function reservePinAttempt(
  userId: string,
  maxAttempts: number
): Promise<{ reservedCount: number; pinHash: string } | null> {
  const result = await pool.query<{ pin_failed_attempts: number; pin_hash: string }>(
    `UPDATE users SET pin_failed_attempts = pin_failed_attempts + 1, updated_at = now()
      WHERE id = $1 AND pin_hash IS NOT NULL
        AND (pin_locked_until IS NULL OR pin_locked_until <= now())
        AND pin_failed_attempts < $2
      RETURNING pin_failed_attempts, pin_hash`,
    [userId, maxAttempts]
  );
  const row = result.rows[0];
  return row ? { reservedCount: row.pin_failed_attempts, pinHash: row.pin_hash } : null;
}

/**
 * A reservation was refused. Either a lock is in force (return it), or
 * the counter is at the limit because other attempts are still IN
 * FLIGHT (they will lock or release it themselves -> "busy"), or those
 * reservations are STALE (a request died after reserving; updated_at is
 * old) -> lock now, so the counter can never stay stuck at the limit.
 * Never locks merely because several correct submissions raced.
 */
export async function resolveRefusedPinAttempt(
  userId: string,
  maxAttempts: number,
  lockoutMinutes: number
): Promise<{ lockedUntil: string | null; busy: boolean }> {
  const result = await pool.query<{ pin_locked_until: string | null; pin_failed_attempts: number }>(
    `UPDATE users SET
        pin_locked_until = CASE
          WHEN (pin_locked_until IS NULL OR pin_locked_until <= now()) AND pin_failed_attempts >= $2
               AND updated_at < now() - interval '1 minute'
            THEN now() + ($3 || ' minutes')::interval
          ELSE pin_locked_until END,
        pin_failed_attempts = CASE
          WHEN (pin_locked_until IS NULL OR pin_locked_until <= now()) AND pin_failed_attempts >= $2
               AND updated_at < now() - interval '1 minute'
            THEN 0
          ELSE pin_failed_attempts END
      WHERE id = $1
      RETURNING pin_locked_until, pin_failed_attempts`,
    [userId, maxAttempts, lockoutMinutes]
  );
  const row = result.rows[0];
  const lockedUntil = row?.pin_locked_until && new Date(row.pin_locked_until) > new Date() ? row.pin_locked_until : null;
  return { lockedUntil, busy: !lockedUntil };
}

/**
 * Correct PIN: releases THIS attempt's reservation together with the
 * failures that preceded it (the legitimate user just proved they know
 * the PIN), but NOT failures reserved concurrently after it — so a
 * correct guess can't wipe out an attacker's in-flight failures.
 * An already-active lock is left in place.
 */
export async function releasePinReservationOnSuccess(userId: string, reservedCount: number): Promise<void> {
  await pool.query(
    "UPDATE users SET pin_failed_attempts = GREATEST(0, pin_failed_attempts - $2), updated_at = now() WHERE id = $1",
    [userId, reservedCount]
  );
}

/** Wrong PIN: the reservation stays counted; lock when the limit is reached. */
export async function confirmPinFailure(
  userId: string,
  maxAttempts: number,
  lockoutMinutes: number
): Promise<{ attempts: number; lockedUntil: string | null }> {
  const result = await pool.query(
    `UPDATE users SET
       pin_locked_until = CASE WHEN pin_failed_attempts >= $2 THEN now() + ($3 || ' minutes')::interval ELSE pin_locked_until END,
       pin_failed_attempts = CASE WHEN pin_failed_attempts >= $2 THEN 0 ELSE pin_failed_attempts END,
       updated_at = now()
     WHERE id = $1
     RETURNING pin_failed_attempts AS attempts, pin_locked_until AS locked_until`,
    [userId, maxAttempts, lockoutMinutes]
  );
  const row = result.rows[0];
  const lockedUntil = row.locked_until && new Date(row.locked_until) > new Date() ? row.locked_until : null;
  return { attempts: row.attempts, lockedUntil };
}
