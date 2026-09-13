import { NextFunction, Request, Response } from "express";
import { ApiError } from "./errorHandler";
import { Role } from "../types/roles";
import { decodeAccessToken } from "../services/authService";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: Role;
  };
}

/**
 * Real JWT verification (Day 2). Expects `Authorization: Bearer
 * <accessToken>`. Any problem — missing header, malformed token,
 * expired token, bad signature — becomes a clean 401 via ApiError,
 * never a raw exception/stack trace reaching the client.
 */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new ApiError(401, "UNAUTHENTICATED", "You must be signed in."));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = decodeAccessToken(token);
    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch {
    // Covers expired tokens and tampered/invalid signatures alike —
    // the client-side response is the same either way: refresh, or
    // if refresh also fails, log out. We don't need to distinguish
    // "expired" from "invalid" for the client to know what to do.
    next(new ApiError(401, "INVALID_TOKEN", "Your session has expired. Please log in again."));
  }
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
