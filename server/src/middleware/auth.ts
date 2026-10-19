import { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";
import { Role } from "../types/roles";
import { decodeAccessToken } from "../services/authService";
import { pool } from "../config/db";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: Role;
  };
}

/**
 * Session check on every protected request (finding M6).
 *
 * The access token's signature/expiry/issuer/audience are verified
 * (lib/jwt.ts), AND the account is looked up so a suspended or deleted
 * account — or one whose role changed — is refused immediately rather
 * than for up to 15 minutes until the token expires. Lookups are cached
 * per instance for at most STATUS_CACHE_MS, which bounds the revocation
 * delay; suspension also revokes refresh tokens, so no new access
 * tokens can be obtained.
 */
const STATUS_CACHE_MS = 15_000;
const statusCache = new Map<string, { status: string; role: string; at: number }>();

export function invalidateUserStatusCache(userId?: string): void {
  if (userId) statusCache.delete(userId);
  else statusCache.clear();
}

async function lookupAccount(userId: string): Promise<{ status: string; role: string } | null> {
  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached;
  const result = await pool.query<{ account_status: string; role: string }>(
    "SELECT account_status, role FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    statusCache.delete(userId);
    return null;
  }
  const entry = { status: row.account_status, role: row.role, at: Date.now() };
  if (statusCache.size > 10_000) statusCache.clear();
  statusCache.set(userId, entry);
  return entry;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new ApiError(401, "UNAUTHENTICATED", "You must be signed in."));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  let payload: { userId: string; role: Role };
  try {
    payload = decodeAccessToken(token);
  } catch {
    next(new ApiError(401, "INVALID_TOKEN", "Your session has expired. Please log in again."));
    return;
  }

  try {
    const account = await lookupAccount(payload.userId);
    if (!account || account.role !== payload.role) {
      next(new ApiError(401, "INVALID_TOKEN", "Your session has expired. Please log in again."));
      return;
    }
    if (account.status === "suspended") {
      next(new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended."));
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  req.user = { id: payload.userId, role: payload.role };
  next();
}

/**
 * Role guard — compose after requireAuth. Returns a real 403 on
 * mismatch, proven with a live request per the Day 2 requirement (see
 * README "Manual test script").
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new ApiError(401, "UNAUTHENTICATED", "You must be signed in."));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ApiError(403, "FORBIDDEN", "You do not have permission to do that."));
      return;
    }
    next();
  };
}
