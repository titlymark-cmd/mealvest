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

/**
 * Access-token hardening (finding L2): the algorithm, issuer and
 * audience are pinned on BOTH sign and verify, so a token using another
 * algorithm (incl. "none"), or one minted for another service sharing
 * the secret, is rejected. Required claims are checked explicitly.
 * jwt.verify throws on expiry/tamper/bad signature — callers turn that
 * into a clean 401.
 */
export const JWT_ALGORITHM = "HS256" as const;
export const JWT_ISSUER = "mealvest-api";
export const JWT_AUDIENCE = "mealvest-app";
const VALID_ROLES: ReadonlySet<string> = new Set(["student", "hotel_staff", "hotel_owner", "mealvest_admin"]);

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ userId: payload.userId, role: payload.role }, env.jwtAccessSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (typeof decoded !== "object" || decoded === null) throw new Error("Malformed token");
  const { userId, role, exp } = decoded as Record<string, unknown>;
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Malformed token subject");
  if (typeof role !== "string" || !VALID_ROLES.has(role)) throw new Error("Malformed token role");
  if (typeof exp !== "number") throw new Error("Token has no expiry");
  return { userId, role: role as Role };
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
