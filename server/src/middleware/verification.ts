import { NextFunction, Response } from "express";
import { env } from "../config/env";
import { pool } from "../config/db";
import { ApiError } from "./errorHandler";
import { AuthedRequest } from "./auth";

/**
 * Backend enforcement of email / phone verification for sensitive operations
 * (never frontend-only). Compose AFTER requireAuth.
 *
 * Every policy is configurable and OFF by default so no existing account is
 * locked out of ordinary use (browsing, ordering, QR redemption) — see
 * config/env.ts. The flags are read per request so a deploy-time change takes
 * effect without code changes.
 *
 * Google accounts arrive with email_verified = true (Google's own verified
 * claim), so the email policy never blocks them; they have no phone requirement
 * unless the phone policy applies to the operation.
 */
async function loadFlags(userId: string): Promise<{ email_verified: boolean; phone_verified: boolean } | null> {
  const r = await pool.query<{ email_verified: boolean; phone_verified: boolean }>(
    "SELECT email_verified, phone_verified FROM users WHERE id = $1",
    [userId]
  );
  return r.rows[0] ?? null;
}

/** Sensitive account / security / money operations require a verified email when REQUIRE_VERIFIED_EMAIL_FOR_SENSITIVE_OPS=true. */
export async function requireVerifiedEmailForSensitiveOps(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!env.requireVerifiedEmailForSensitiveOps) return next();
  try {
    const flags = req.user ? await loadFlags(req.user.id) : null;
    if (!flags?.email_verified) {
      throw new ApiError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Please verify your email address before doing this. You can do that from your account settings."
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Savings withdrawals require a verified phone when REQUIRE_VERIFIED_PHONE_FOR_WITHDRAWAL=true. */
export async function requireVerifiedPhoneForWithdrawal(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!env.requireVerifiedPhoneForWithdrawal) return next();
  try {
    const flags = req.user ? await loadFlags(req.user.id) : null;
    if (!flags?.phone_verified) {
      throw new ApiError(
        403,
        "PHONE_NOT_VERIFIED",
        "Verify your phone number in your profile before withdrawing."
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
