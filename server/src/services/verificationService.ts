import crypto from "crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { findUserById } from "../models/userModel";
import { sendVerificationEmail, isEmailConfigured, emailConfigProblem } from "./emailService";
import { sendSMS, isSmsConfigured } from "./smsService";
import { SmsDeliveryError } from "./smsProvider";

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
 *
 * Delivery is AWAITED: "sent" is only reported after the provider accepted the
 * message. If delivery fails the freshly created token is deleted (which also
 * releases the send allowance, since nothing reached the user) and an honest
 * error is returned. The previous still-valid token is only superseded AFTER
 * the new one was delivered, so a failed resend never leaves the user with
 * nothing. Superseded tokens are kept (marked consumed) so the daily cap
 * counts every message actually sent.
 */

export const EMAIL_TOKEN_TTL_HOURS = 24;
export const PHONE_CODE_TTL_MINUTES = 10;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_DAY = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

export type VerificationChannel = "email" | "phone";

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}
function phoneCodeHash(userId: string, code: string): string {
  // Domain-separated key derived from the server secret — never stored.
  const key = crypto.createHash("sha256").update(`mealvest-phone-verification:${env.jwtAccessSecret}`).digest();
  return crypto.createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

/**
 * Serialises concurrent sends for one user+channel, enforces the resend
 * cooldown and the daily cap, and inserts the new token — all in one
 * transaction so parallel requests can't slip past the limits.
 * Returns the new token row id.
 */
async function reserveToken(params: {
  userId: string;
  channel: VerificationChannel;
  target: string;
  tokenHash: string;
  ttlSql: string; // e.g. "24 hours" (constant, never user input)
}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`verify:${params.userId}:${params.channel}`]);

    const stats = await client.query<{ n: number; newest_age: number | null }>(
      `SELECT count(*)::int AS n,
              extract(epoch FROM (now() - max(created_at)))::float AS newest_age
         FROM verification_tokens
        WHERE user_id = $1 AND channel = $2 AND created_at > now() - interval '24 hours'`,
      [params.userId, params.channel]
    );
    const { n, newest_age } = stats.rows[0];
    if (n >= MAX_SENDS_PER_DAY) {
      throw new ApiError(429, "VERIFICATION_LIMIT", "Too many verification messages today. Please try again tomorrow.");
    }
    if (newest_age !== null && newest_age < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - newest_age);
      throw new ApiError(429, "VERIFICATION_COOLDOWN", `Please wait ${wait} seconds before requesting another one.`);
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '${params.ttlSql}') RETURNING id`,
      [params.userId, params.channel, params.target, params.tokenHash]
    );
    await client.query("COMMIT");
    return ins.rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Delivery failed: nothing reached the user, so remove the token (this releases the allowance too). */
async function discardToken(id: string): Promise<void> {
  await pool.query("DELETE FROM verification_tokens WHERE id = $1", [id]).catch((e) =>
    console.error("[verification] could not discard undelivered token:", (e as Error).message)
  );
}

/** Delivery succeeded: older unused tokens for this user+channel are now superseded. */
async function supersedeOlder(userId: string, channel: VerificationChannel, keepId: string): Promise<void> {
  await pool.query(
    `UPDATE verification_tokens SET consumed_at = now()
      WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL AND id <> $3
        AND created_at < (SELECT created_at FROM verification_tokens WHERE id = $3)`,
    [userId, channel, keepId]
  );
}

export interface RequestResult {
  sent: boolean;
  alreadyVerified: boolean;
  resendAfterSeconds?: number;
}

export async function requestEmailVerification(userId: string): Promise<RequestResult> {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Account not found.");
  if (user.email_verified) return { sent: false, alreadyVerified: true };
  if (!isEmailConfigured()) {
    console.error(`[verification] email verification unavailable: ${emailConfigProblem()}`);
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email verification isn't available right now.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const target = user.email.toLowerCase();
  const id = await reserveToken({
    userId,
    channel: "email",
    target,
    tokenHash: sha256(token),
    ttlSql: `${EMAIL_TOKEN_TTL_HOURS} hours`,
  });

  try {
    await sendVerificationEmail(user.email, `${env.appBaseUrl}/verify-email?token=${token}`);
  } catch (err) {
    await discardToken(id);
    if (err instanceof ApiError && err.code === "EMAIL_NOT_CONFIGURED") throw err;
    throw new ApiError(502, "EMAIL_SEND_FAILED", "We couldn't send the email right now. Please try again in a few minutes.");
  }
  await supersedeOlder(userId, "email", id);
  return { sent: true, alreadyVerified: false, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
}

/** Public (link click). Atomic single-use; bound to the address it was sent to. */
export async function confirmEmailVerification(token: string): Promise<{ verified: true }> {
  const invalid = new ApiError(400, "INVALID_VERIFICATION_TOKEN", "This verification link is invalid.");
  if (!/^[0-9a-f]{64}$/.test(token)) throw invalid;
  const hash = sha256(token);

  const consumed = await pool.query<{ user_id: string; target: string }>(
    `UPDATE verification_tokens SET consumed_at = now()
      WHERE channel = 'email' AND token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING user_id, target`,
    [hash]
  );
  const row = consumed.rows[0];
  if (!row) {
    // Work out WHY, so the page can say something useful. The token is a 256-bit secret the
    // caller already holds, so describing its state reveals nothing about anyone else.
    const why = await pool.query<{ expired: boolean; consumed: boolean }>(
      `SELECT (expires_at <= now()) AS expired, (consumed_at IS NOT NULL) AS consumed
         FROM verification_tokens WHERE channel = 'email' AND token_hash = $1`,
      [hash]
    );
    const w = why.rows[0];
    if (!w) throw invalid;
    // Strictly single-use: a replay is REJECTED (it changes nothing), with a distinct code so the page
    // can explain it kindly ("already used — if you're signed in, check your account status").
    if (w.consumed) {
      throw new ApiError(400, "VERIFICATION_LINK_USED", "This link was already used or replaced by a newer one. Use the latest email we sent, or request a new link.");
    }
    throw new ApiError(400, "VERIFICATION_LINK_EXPIRED", "This verification link has expired. Request a new one from your account.");
  }

  const updated = await pool.query(
    "UPDATE users SET email_verified = true, email_verified_at = now(), updated_at = now() WHERE id = $1 AND lower(email) = $2",
    [row.user_id, row.target]
  );
  if ((updated.rowCount ?? 0) === 0) {
    // The address changed after the link was sent; that link must never verify the new address.
    throw new ApiError(400, "INVALID_VERIFICATION_TOKEN", "This link was for a different email address. Request a new one.");
  }
  return { verified: true };
}

export async function requestPhoneVerification(userId: string): Promise<RequestResult> {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Account not found.");
  const verified = (user as unknown as { phone_verified?: boolean }).phone_verified;
  if (verified) return { sent: false, alreadyVerified: true };
  if (!user.phone_number) throw new ApiError(400, "NO_PHONE", "Add a phone number to your profile first.");
  if (!isSmsConfigured()) throw new ApiError(503, "SMS_NOT_CONFIGURED", "Phone verification isn't available right now.");

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const phone = user.phone_number;
  const id = await reserveToken({
    userId,
    channel: "phone",
    target: phone,
    tokenHash: phoneCodeHash(userId, code),
    ttlSql: `${PHONE_CODE_TTL_MINUTES} minutes`,
  });

  try {
    await sendSMS({
      phoneNumber: phone,
      message: `Your MEALVEST verification code is ${code}. It expires in ${PHONE_CODE_TTL_MINUTES} minutes. Never share it.`,
    });
  } catch (err) {
    await discardToken(id);
    if (err instanceof SmsDeliveryError) {
      if (err.reason === "invalid_number") {
        throw new ApiError(400, "INVALID_PHONE", err.message);
      }
      throw new ApiError(502, "SMS_SEND_FAILED", err.message);
    }
    if (err instanceof ApiError && err.code === "SMS_NOT_CONFIGURED") throw err;
    console.error("[verification] unexpected SMS failure:", (err as Error)?.message);
    throw new ApiError(502, "SMS_SEND_FAILED", "We couldn't send the SMS right now. Please try again later.");
  }
  await supersedeOlder(userId, "phone", id);
  return { sent: true, alreadyVerified: false, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
}

/** Authenticated. Row-locked so parallel guesses can't exceed the attempt limit. */
export async function confirmPhoneVerification(userId: string, code: string): Promise<{ verified: true }> {
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, "INVALID_VERIFICATION_CODE", "Enter the 6-digit code from the SMS.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT *, (expires_at > now()) AS live FROM verification_tokens
        WHERE user_id = $1 AND channel = 'phone'
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [userId]
    );
    const row = r.rows[0];
    const expired = new ApiError(400, "VERIFICATION_CODE_EXPIRED", "That code has expired or was already used. Request a new one.");
    const tooMany = new ApiError(429, "VERIFICATION_TOO_MANY_ATTEMPTS", "Too many wrong attempts. Request a new code.");

    if (!row) { await client.query("COMMIT"); throw expired; }
    if (row.attempts >= PHONE_CODE_MAX_ATTEMPTS) { await client.query("COMMIT"); throw tooMany; }
    if (row.consumed_at !== null || !row.live) { await client.query("COMMIT"); throw expired; }

    const expected = Buffer.from(row.token_hash, "hex");
    const actual = Buffer.from(phoneCodeHash(userId, code), "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      const upd = await client.query<{ attempts: number }>(
        `UPDATE verification_tokens SET attempts = attempts + 1,
           consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE NULL END
         WHERE id = $1 RETURNING attempts`,
        [row.id, PHONE_CODE_MAX_ATTEMPTS]
      );
      await client.query("COMMIT");
      const left = PHONE_CODE_MAX_ATTEMPTS - upd.rows[0].attempts;
      if (left <= 0) throw tooMany;
      throw new ApiError(400, "INVALID_VERIFICATION_CODE", `That code is incorrect. ${left} attempt${left === 1 ? "" : "s"} left.`);
    }

    await client.query("UPDATE verification_tokens SET consumed_at = now() WHERE id = $1", [row.id]);
    const u = await client.query(
      "UPDATE users SET phone_verified = true, phone_verified_at = now(), updated_at = now() WHERE id = $1 AND phone_number = $2",
      [userId, row.target]
    );
    if ((u.rowCount ?? 0) === 0) {
      await client.query("COMMIT");
      throw new ApiError(400, "VERIFICATION_CODE_EXPIRED", "Your phone number changed after that code was sent. Request a new one.");
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

export interface VerificationStatus {
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  authProvider: "password" | "google";
  /** Whether the server can currently deliver each kind of message. */
  emailDeliveryAvailable: boolean;
  smsDeliveryAvailable: boolean;
  resendCooldownSeconds: number;
}

/** Role-agnostic status for the shared verification UI. */
export async function getVerificationStatus(userId: string): Promise<VerificationStatus> {
  const r = await pool.query(
    "SELECT email, email_verified, email_verified_at, phone_number, phone_verified, auth_provider FROM users WHERE id = $1",
    [userId]
  );
  const u = r.rows[0];
  if (!u) throw new ApiError(404, "USER_NOT_FOUND", "Account not found.");
  return {
    email: u.email,
    emailVerified: Boolean(u.email_verified),
    emailVerifiedAt: u.email_verified_at ? new Date(u.email_verified_at).toISOString() : null,
    phoneNumber: u.phone_number,
    phoneVerified: Boolean(u.phone_verified),
    authProvider: u.auth_provider,
    emailDeliveryAvailable: isEmailConfigured(),
    smsDeliveryAvailable: isSmsConfigured(),
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

/** Test hook only: lets integration tests plant a code without sending a real SMS. */
export const __testing = { phoneCodeHash, sha256 };
