import { pool } from "../config/db";

export async function insertRefreshToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [params.userId, params.tokenHash, params.expiresAt]
  );
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export async function findValidRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const result = await pool.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [tokenHash]);
}

/** Used on password change / suspicious activity — kills every session for a user. */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
    userId,
  ]);
}
