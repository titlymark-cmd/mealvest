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

/** Successful PIN verification — resets the counter and clears any lockout. */
export async function resetPinAttempts(userId: string): Promise<void> {
  await pool.query(
    "UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1",
    [userId]
  );
}

/**
 * Records one failed PIN attempt. Returns the resulting attempt count
 * and lockout timestamp so the caller can build an accurate error
 * message (e.g. "3 attempts left") without a second round trip.
 * PIN_LOCKOUT_MINUTES is applied entirely in SQL so the DB's clock —
 * not the app server's — is authoritative, same reasoning as
 * budgetService's CURRENT_DATE rollover checks.
 */
export async function recordFailedPinAttempt(
  userId: string,
  maxAttempts: number,
  lockoutMinutes: number
): Promise<{ attempts: number; lockedUntil: string | null }> {
  const result = await pool.query(
    `UPDATE users SET
       pin_failed_attempts = CASE WHEN pin_failed_attempts + 1 >= $2 THEN 0 ELSE pin_failed_attempts + 1 END,
       pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE pin_locked_until END,
       updated_at = now()
     WHERE id = $1
     RETURNING pin_failed_attempts AS attempts, pin_locked_until AS locked_until`,
    [userId, maxAttempts, lockoutMinutes]
  );
  return { attempts: result.rows[0].attempts, lockedUntil: result.rows[0].locked_until };
}
