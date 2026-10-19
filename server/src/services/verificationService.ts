import crypto from "crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { findUserById } from "../models/userModel";
import { sendVerificationEmail, isEmailConfigured } from "./emailService";
import { sendSMS, isSmsConfigured } from "./smsService";
import { runInBackground } from "../lib/background";

/**
 * Email & phone verification (findings H7 full, M3).
 *
 * Authoritative channel per account type:
 *   - password accounts: email is verified by an emailed one-time link;
 *     phone (the M-Pesa number) by a 6-digit SMS code.
 *   - Google accounts: email_verified comes from Google's verified-email
 *     claim (required at sign-in since Stage 1); phone is not required.
 *
 * Tokens: 256-bit random link tokens stored as sha256; 6-digit codes
 * stored as HMAC-SHA256 (server key) so a DB leak can't be brute-forced
 * offline. Single use (atomic consume), short expiry, bound to the exact
 * email/phone they were sent to, max 5 wrong code attempts, older tokens
 * invalidated on resend, per-user daily send caps (cost control).
 * Responses never reveal whether some OTHER account exists.
 */

export const EMAIL_TOKEN_TTL_HOURS = 24;
export const PHONE_CODE_TTL_MINUTES = 10;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_DAY = 5;

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}
function phoneCodeHash(userId: string, code: string): string {
  // Domain-separated key derived from the server secret — never stored.
  const key = crypto.createHash("sha256").update(`mealvest-phone-verification:${env.jwtAccessSecret}`).digest();
  return crypto.createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

async function assertUnderDailyCap(userId: string, channel: "email" | "phone"): Promise<void> {
  const r = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM verification_tokens WHERE user_id = $1 AND channel = $2 AND created_at > now() - interval '24 hours'",
    [userId, channel]
  );
  if (r.rows[0].n >= MAX_SENDS_PER_DAY) {
    throw new ApiError(429, "VERIFICATION_LIMIT", "Too many verification messages today. Please try again tomorrow.");
  }
}

export async function requestEmailVerification(userId: string): Promise<{ sent: boolean; alreadyVerified: boolean }> {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Account not found.");
  if (user.email_verified) return { sent: false, alreadyVerified: true };
  if (!env.appBaseUrl || !isEmailConfigured()) {
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email verification isn't available right now.");
  }
  await assertUnderDailyCap(userId, "email");

  const token = crypto.randomBytes(32).toString("hex");
  const target = user.email.toLowerCase();
  await pool.query("DELETE FROM verification_tokens WHERE user_id = $1 AND channel = 'email' AND consumed_at IS NULL", [userId]);
  await pool.query(
    `INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at)
     VALUES ($1, 'email', $2, $3, now() + ($4 || ' hours')::interval)`,
    [userId, target, sha256(token), EMAIL_TOKEN_TTL_HOURS]
  );
  const url = `${env.appBaseUrl}/verify-email?token=${token}`;
  runInBackground("verification-email", () => sendVerificationEmail(user.email, url));
  return { sent: true, alreadyVerified: false };
}

/** Public (link click). Atomic single-use; bound to the address it was sent to. */
export async function confirmEmailVerification(token: string): Promise<{ verified: true }> {
  const invalid = new ApiError(400, "INVALID_VERIFICATION_TOKEN", "This verification link is invalid or has expired.");
  if (!/^[0-9a-f]{64}$/.test(token)) throw invalid;
  const consumed = await pool.query<{ user_id: string; target: string }>(
    `UPDATE verification_tokens SET consumed_at = now()
      WHERE channel = 'email' AND token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING user_id, target`,
    [sha256(token)]
  );
  const row = consumed.rows[0];
  if (!row) throw invalid;
  const updated = await pool.query(
    "UPDATE users SET email_verified = true, email_verified_at = now(), updated_at = now() WHERE id = $1 AND lower(email) = $2",
    [row.user_id, row.target]
  );
  if ((updated.rowCount ?? 0) === 0) throw invalid; // email changed since the link was sent
  return { verified: true };
}

export async function requestPhoneVerification(userId: string): Promise<{ sent: boolean; alreadyVerified: boolean }> {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Account not found.");
  const verified = (user as unknown as { phone_verified?: boolean }).phone_verified;
  if (verified) return { sent: false, alreadyVerified: true };
  if (!user.phone_number) throw new ApiError(400, "NO_PHONE", "Add a phone number to your profile first.");
  if (!isSmsConfigured()) throw new ApiError(503, "SMS_NOT_CONFIGURED", "Phone verification isn't available right now.");
  await assertUnderDailyCap(userId, "phone");

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await pool.query("DELETE FROM verification_tokens WHERE user_id = $1 AND channel = 'phone' AND consumed_at IS NULL", [userId]);
  await pool.query(
    `INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at)
     VALUES ($1, 'phone', $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, user.phone_number, phoneCodeHash(userId, code), PHONE_CODE_TTL_MINUTES]
  );
  const phone = user.phone_number;
  runInBackground("verification-sms", () =>
    sendSMS({ phoneNumber: phone, message: `Your MEALVEST verification code is ${code}. It expires in ${PHONE_CODE_TTL_MINUTES} minutes. Never share it.` })
  );
  return { sent: true, alreadyVerified: false };
}

/** Authenticated. Row-locked so parallel guesses can't exceed the attempt limit. */
export async function confirmPhoneVerification(userId: string, code: string): Promise<{ verified: true }> {
  const invalid = new ApiError(400, "INVALID_VERIFICATION_CODE", "That code is incorrect or has expired. Request a new one.");
  if (!/^\d{6}$/.test(code)) throw invalid;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT * FROM verification_tokens
        WHERE user_id = $1 AND channel = 'phone' AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId]
    );
    const row = r.rows[0];
    if (!row || row.attempts >= PHONE_CODE_MAX_ATTEMPTS) {
      await client.query("COMMIT");
      throw invalid;
    }
    const expected = Buffer.from(row.token_hash, "hex");
    const actual = Buffer.from(phoneCodeHash(userId, code), "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      await client.query(
        `UPDATE verification_tokens SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE NULL END
         WHERE id = $1`,
        [row.id, PHONE_CODE_MAX_ATTEMPTS]
      );
      await client.query("COMMIT");
      throw invalid;
    }
    await client.query("UPDATE verification_tokens SET consumed_at = now() WHERE id = $1", [row.id]);
    const u = await client.query(
      "UPDATE users SET phone_verified = true, phone_verified_at = now(), updated_at = now() WHERE id = $1 AND phone_number = $2",
      [userId, row.target]
    );
    if ((u.rowCount ?? 0) === 0) {
      await client.query("COMMIT");
      throw invalid; // phone changed since the code was sent
    }
    await client.query("COMMIT");
    return { verified: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Test hook only: lets integration tests plant a code without sending a real SMS. */
export const __testing = { phoneCodeHash, sha256 };
