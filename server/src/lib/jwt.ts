import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";
import { Role } from "../types/roles";

export interface AccessTokenPayload {
  userId: string;
  role: Role;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // jwt.verify throws on expiry/tamper/bad-signature — callers catch
  // and turn that into a clean 401, never a stack trace to the client.
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings, NOT JWTs — there's
 * nothing to "decode", they're just a high-entropy secret the client
 * holds and the server looks up by its hash. This avoids the whole
 * class of JWT-refresh-token pitfalls (can't be revoked without a
 * blocklist, etc.) since revocation here is just deleting/marking a
 * DB row.
 */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString("hex");
  const hash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  // SHA-256 is fine here (not bcrypt) — this is a high-entropy random
  // token, not a human-chosen password, so there's no offline
  // guessing risk to defend against with a slow hash.
  return crypto.createHash("sha256").update(token).digest("hex");
}
