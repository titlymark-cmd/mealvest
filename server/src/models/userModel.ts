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
