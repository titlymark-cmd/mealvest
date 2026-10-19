import { pool } from "../config/db";

/**
 * Refresh tokens are opaque random strings stored only as sha256 hashes.
 * Each login starts a FAMILY; every refresh rotates within the family
 * (finding M6, migration 050).
 */

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  replaced_by: string | null;
  created_at: string;
}

export async function insertRefreshToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  familyId?: string | null;
}): Promise<{ id: string; family_id: string }> {
  const result = await pool.query<{ id: string; family_id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id)
     VALUES ($1, $2, $3, COALESCE($4::uuid, gen_random_uuid()))
     RETURNING id, family_id`,
    [params.userId, params.tokenHash, params.expiresAt, params.familyId ?? null]
  );
  return result.rows[0];
}

export async function findValidRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function findRefreshTokenByHashAnyState(tokenHash: string): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);
  return result.rows[0] ?? null;
}

/**
 * Atomically consumes a valid refresh token. Exactly one concurrent
 * caller gets the row back; all others get null.
 */
export async function consumeRefreshToken(tokenHash: string, reason: "rotated" | "pin_unlock"): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING *`,
    [tokenHash, reason]
  );
  return result.rows[0] ?? null;
}

export async function setReplacedBy(id: string, replacedBy: string): Promise<void> {
  await pool.query("UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1", [id, replacedBy]);
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = COALESCE(revoked_reason, 'logout') WHERE token_hash = $1 AND revoked_at IS NULL",
    [tokenHash]
  );
}

/** Revokes every still-valid token in a family (logout, or reuse detected). */
export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const result = await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2 WHERE family_id = $1 AND revoked_at IS NULL",
    [familyId, reason]
  );
  return result.rowCount ?? 0;
}

/** Used on password change / reset / suspension — kills every session for a user. */
export async function revokeAllRefreshTokensForUser(userId: string, reason = "credentials_changed"): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL",
    [userId, reason]
  );
}
