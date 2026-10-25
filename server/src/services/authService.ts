import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { hashPassword, verifyPassword } from "../lib/password";
import { normalizeKenyanPhone } from "../lib/phone";
import { signAccessToken, generateRefreshToken, hashRefreshToken, verifyAccessToken } from "../lib/jwt";
import {
  insertRefreshToken,
  findValidRefreshTokenByHash,
  findRefreshTokenByHashAnyState,
  consumeRefreshToken,
  setReplacedBy,
  revokeFamily,
} from "../models/refreshTokenModel";
import {
  findUserByEmailOrPhone,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  setUserPin,
  reservePinAttempt,
  resolveRefusedPinAttempt,
  releasePinReservationOnSuccess,
  confirmPinFailure,
  UserRow,
} from "../models/userModel";
import { GoogleProfile } from "../lib/googleAuth";
import { Role } from "../types/roles";
import { RegisterStudentInput, RegisterHotelInput, LoginInput } from "../schemas/authSchemas";
import { revokeAllRefreshTokensForUser } from "../models/refreshTokenModel";
import { sendPasswordResetEmail } from "./emailService";
import * as notificationEvents from "./notificationEvents";
import { runInBackground } from "../lib/background";

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: Role; fullName: string; email: string };
}

async function issueTokens(
  userId: string,
  role: Role,
  fullName: string,
  email: string,
  rotation?: { familyId: string; previousId: string }
): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId, role });
  const { token: refreshToken, hash, expiresAt } = generateRefreshToken();
  const inserted = await insertRefreshToken({ userId, tokenHash: hash, expiresAt, familyId: rotation?.familyId ?? null });
  if (rotation) await setReplacedBy(rotation.previousId, inserted.id);
  return { accessToken, refreshToken, user: { id: userId, role, fullName, email } };
}

/** Window in which presenting a just-rotated token is treated as a benign concurrent refresh (two tabs), not theft. */
const REFRESH_REUSE_GRACE_MS = 30_000;

/**
 * Atomically consumes a refresh token, with reuse detection (M6):
 *  - valid -> consumed by exactly one caller (UPDATE ... RETURNING);
 *  - already rotated within the grace window -> 401 REFRESH_TOKEN_ROTATED
 *    (a sibling tab won the race; the client re-reads its stored token);
 *  - already rotated earlier -> REUSE: the whole family is revoked,
 *    logging out every device holding a descendant of the stolen token.
 */
async function consumeForRotation(refreshToken: string, reason: "rotated" | "pin_unlock") {
  const tokenHash = hashRefreshToken(refreshToken);
  const consumed = await consumeRefreshToken(tokenHash, reason);
  if (consumed) return consumed;

  const existing = await findRefreshTokenByHashAnyState(tokenHash);
  if (existing && existing.revoked_at && (existing.revoked_reason === "rotated" || existing.revoked_reason === "pin_unlock")) {
    const age = Date.now() - new Date(existing.revoked_at).getTime();
    if (age <= REFRESH_REUSE_GRACE_MS) {
      throw new ApiError(401, "REFRESH_TOKEN_ROTATED", "Session was just refreshed. Please retry.");
    }
    const revoked = await revokeFamily(existing.family_id, "reuse_detected");
    console.warn("[auth] refresh-token reuse detected — token family revoked", {
      userId: existing.user_id,
      familyId: existing.family_id,
      revokedTokens: revoked,
    });
  }
  throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
}

/**
 * Both registration flows run inside a single DB transaction —
 * either the users row AND the role-profile row (students / hotels +
 * hotel_staff) all land together, or none of them do. A student who
 * "registered" but has no students row (because the second insert
 * failed) is exactly the kind of half-created account transactions
 * exist to prevent.
 */
export async function registerStudent(input: RegisterStudentInput): Promise<AuthResult> {
  const normalizedPhone = normalizeKenyanPhone(input.phoneNumber);
  if (!normalizedPhone) {
    throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
  }

  await assertNoDuplicateAccount(input.email, normalizedPhone);
  const passwordHash = await hashPassword(input.password);
  const pinHash = await hashPassword(input.pin);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, $4, 'student', 'password', false, 'active')
       RETURNING id`,
      [input.email.toLowerCase(), normalizedPhone, passwordHash, pinHash]
    );
    const userId = userResult.rows[0].id as string;

    await client.query(
      `INSERT INTO students (user_id, full_name, institution, admission_number)
       VALUES ($1, $2, $3, $4)`,
      [userId, input.fullName, input.institution ?? null, input.admissionNumber ?? null]
    );

    await client.query("COMMIT");
    notificationEvents.welcomeStudent(userId, input.fullName);
    return issueTokens(userId, "student", input.fullName, input.email);
  } catch (err) {
    await client.query("ROLLBACK");
    throw mapDbError(err);
  } finally {
    client.release();
  }
}

/**
 * Hotel PARTNER registration — self-service application, not
 * instant activation. Creates users + hotels + hotel_staff exactly
 * as before, but now: application_status starts at 'submitted' (the
 * hotel just finished the 6-step form, this isn't a draft), payment_
 * verification_status starts at 'pending' (an admin must check
 * settlement details before any real payout happens), and the
 * commercial plan chosen determines the hotel's actual
 * registration_fee/commission_percent/settlement_schedule at this
 * moment — those three fields can still be individually adjusted
 * later by an admin (see admin.controller.ts updateHotelCommission),
 * same as before this change.
 */
export async function registerHotel(input: RegisterHotelInput): Promise<AuthResult & { applicationId: string }> {
  const normalizedPhone = normalizeKenyanPhone(input.phoneNumber);
  if (!normalizedPhone) {
    throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
  }

  await assertNoDuplicateAccount(input.email, normalizedPhone);
  const passwordHash = await hashPassword(input.password);
  const pinHash = await hashPassword(input.pin);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planResult = input.commercialPlanId
      ? await client.query(
          "SELECT id, onboarding_fee, commission_percent, settlement_schedule FROM hotel_commercial_plans WHERE id = $1 AND active = TRUE",
          [input.commercialPlanId]
        )
      : // No plan chosen — MVP1 default: pick the lowest onboarding
        // fee among active plans, so sign-up never blocks on a
        // decision the hotel hasn't made yet. An admin (or the hotel
        // itself, in an MVP2 self-service flow) can change this
        // later via updateHotelCommission — nothing here is
        // permanent.
        await client.query(
          "SELECT id, onboarding_fee, commission_percent, settlement_schedule FROM hotel_commercial_plans WHERE active = TRUE ORDER BY onboarding_fee ASC LIMIT 1"
        );
    if (planResult.rows.length === 0) {
      throw new ApiError(404, "PLAN_NOT_FOUND", "No commercial plan is currently available.");
    }
    const plan = planResult.rows[0];

    const seqResult = await client.query("SELECT nextval('hotel_application_seq') AS n");
    const applicationId = `MV-HTL-${String(seqResult.rows[0].n).padStart(6, "0")}`;

    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, $4, 'hotel_owner', 'password', false, 'pending_verification')
       RETURNING id`,
      [input.email.toLowerCase(), normalizedPhone, passwordHash, pinHash]
    );
    const userId = userResult.rows[0].id as string;

    const hotelResult = await client.query(
      `INSERT INTO hotels (
         name, location, contact_phone, contact_email, status,
         application_id, business_type, business_registration_number, kra_pin,
         county, town, landmark, whatsapp_number, description,
         opening_hours, closing_hours, days_open, branches_count, employees_count,
         owner_contact_name, contact_position, contact_id_number, preferred_contact_method,
         payment_method, payment_details,
         commercial_plan_id, registration_fee, commission_percent, settlement_schedule,
         payout_mode, payout_time,
         application_status, application_submitted_at, payment_verification_status
       )
       VALUES (
         $1, $2, $3, $4, 'pending_verification',
         $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21, $22,
         $23, $24,
         $25, $26, $27, $28,
         $29, $30,
         'submitted', now(), 'pending'
       )
       RETURNING *`,
      [
        input.hotelName,
        input.location ?? null,
        normalizedPhone,
        input.email.toLowerCase(),
        applicationId,
        input.businessType,
        input.businessRegistrationNumber ?? null,
        input.kraPin ?? null,
        input.county ?? null,
        input.town ?? null,
        input.landmark ?? null,
        input.whatsappNumber ?? null,
        input.description ?? null,
        input.openingTime ?? null,
        input.closingTime ?? null,
        input.daysOpen ?? [],
        input.branchesCount ?? null,
        input.employeesCount ?? null,
        input.contactFullName,
        input.contactPosition,
        input.contactIdNumber ?? null,
        input.preferredContactMethod,
        input.settlement.method,
        JSON.stringify(input.settlement),
        plan.id,
        plan.onboarding_fee,
        plan.commission_percent,
        plan.settlement_schedule,
        input.payout?.mode ?? "instant",
        input.payout?.mode === "daily" ? input.payout.payoutTime : null,
      ]
    );
    const hotel = hotelResult.rows[0];

    await client.query(
      `INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level)
       VALUES ($1, $2, $3, 'owner')`,
      [userId, hotel.id, input.contactFullName]
    );

    await client.query(
      `INSERT INTO hotel_payment_detail_changes (hotel_id, changed_by, new_payment_method, new_payment_details)
       VALUES ($1, $2, $3, $4)`,
      [hotel.id, userId, input.settlement.method, JSON.stringify(input.settlement)]
    );

    await client.query("COMMIT");
    notificationEvents.welcomeHotel(userId, input.hotelName);
    const tokens = await issueTokens(userId, "hotel_owner", input.contactFullName, input.email);
    return { ...tokens, applicationId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw mapDbError(err);
  } finally {
    client.release();
  }
}

/**
 * Deliberately generic failure message — "wrong password" and
 * "no such user" return the exact same error, so a login attempt
 * can't be used to enumerate which emails/phone numbers have MEALVEST
 * accounts.
 */
const INVALID_CREDENTIALS = new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email/phone or password.");

export interface LoginPendingResult {
  status: "pending_pin";
  pendingToken: string;
  pinSet: boolean;
}

/**
 * Password login is now only step 1 of 2 — it never issues real
 * tokens itself. On success it hands back an opaque pendingToken (see
 * pending_login_tokens / migration 034) that only POST
 * /auth/login/verify-pin or /auth/login/set-pin can redeem into a
 * real session, depending on `pinSet` (whether this account already
 * has a PIN or needs to create one first). Google login is
 * deliberately untouched — this PIN gate is specifically the second
 * factor on top of a password, per spec.
 */
export async function login(input: LoginInput): Promise<LoginPendingResult> {
  const user = await findUserByEmailOrPhone(input.identifier);
  if (!user || !user.password_hash) {
    // Still run a hash comparison against a dummy value even when no
    // user was found, so the response time doesn't leak "this
    // identifier doesn't exist" via a timing side-channel.
    await verifyPassword(input.password, DUMMY_HASH);
    throw INVALID_CREDENTIALS;
  }

  if (user.account_status === "suspended") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
  }

  const valid = await verifyPassword(input.password, user.password_hash);
  if (!valid) throw INVALID_CREDENTIALS;

  const pendingToken = await createPendingLoginToken(user.id);
  return { status: "pending_pin", pendingToken, pinSet: Boolean(user.pin_hash) };
}

const PENDING_LOGIN_TTL_MINUTES = 10;

async function createPendingLoginToken(userId: string): Promise<string> {
  const token = generateRefreshToken().token; // just reusing the same high-entropy random-token generator
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + PENDING_LOGIN_TTL_MINUTES * 60 * 1000);
  await pool.query("INSERT INTO pending_login_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    tokenHash,
    expiresAt,
  ]);
  return token;
}

/** Read-only — does NOT consume the token, so a wrong PIN can be retried against the same pending login. */
async function lookupPendingLoginToken(token: string): Promise<string> {
  const tokenHash = hashRefreshToken(token);
  const result = await pool.query("SELECT user_id FROM pending_login_tokens WHERE token_hash = $1 AND expires_at > now()", [
    tokenHash,
  ]);
  if (result.rows.length === 0) {
    throw new ApiError(401, "LOGIN_EXPIRED", "This login attempt has expired. Please log in again.");
  }
  return result.rows[0].user_id;
}

/** Consumes the pending login atomically — exactly one concurrent caller can redeem it. */
async function deletePendingLoginToken(token: string): Promise<void> {
  const result = await pool.query("DELETE FROM pending_login_tokens WHERE token_hash = $1 AND expires_at > now()", [
    hashRefreshToken(token),
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ApiError(401, "LOGIN_EXPIRED", "This login attempt has expired. Please log in again.");
  }
}

/**
 * Step 2 of login for an account that already has a PIN. Reuses the
 * exact same lockout-aware verification as the app-relaunch
 * quick-unlock (verifyPinForUser) — one wrong-PIN policy, enforced in
 * one place, whether the student is unlocking an existing session or
 * completing a brand new login.
 */
export async function completeLoginWithPin(pendingToken: string, pin: string): Promise<AuthResult> {
  const userId = await lookupPendingLoginToken(pendingToken);
  const user = await findUserById(userId);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(401, "LOGIN_EXPIRED", "This login attempt has expired. Please log in again.");
  }
  await verifyPinForUser(user, pin);
  await deletePendingLoginToken(pendingToken);
  const fullName = await lookupFullName(user);
  return issueTokens(user.id, user.role, fullName, user.email);
}

/**
 * Step 2 of login for an account with no PIN yet (pinSet: false in
 * the step-1 response) — creates it on the spot. No currentPassword
 * re-check needed here the way the settings-screen setPin() requires
 * one: the pendingToken itself already proves the password was just
 * verified seconds ago in step 1.
 */
export async function completeLoginWithNewPin(pendingToken: string, pin: string): Promise<AuthResult> {
  const userId = await lookupPendingLoginToken(pendingToken);
  const user = await findUserById(userId);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(401, "LOGIN_EXPIRED", "This login attempt has expired. Please log in again.");
  }
  if (user.pin_hash) {
    throw new ApiError(400, "PIN_ALREADY_SET", "A PIN is already set for this account — enter it instead.");
  }
  await deletePendingLoginToken(pendingToken);
  const pinHash = await hashPassword(pin);
  const updated = await pool.query(
    `UPDATE users SET pin_hash = $1, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now()
      WHERE id = $2 AND pin_hash IS NULL`,
    [pinHash, user.id]
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new ApiError(400, "PIN_ALREADY_SET", "A PIN is already set for this account — enter it instead.");
  }
  const fullName = await lookupFullName(user);
  return issueTokens(user.id, user.role, fullName, user.email);
}

// A real bcrypt hash of an unreachable password, used only to burn
// the same amount of time as a real comparison would take.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7CFwNKSMxxMZslJvzYqfvhLcU8odxYm";

/**
 * Google Sign-In entry point. The ID token itself has ALREADY been
 * cryptographically verified against Google's public keys by the
 * time this runs (see lib/googleAuth.ts) — this function's job is
 * purely the find-or-create + token issuance, never re-checking the
 * token's authenticity.
 *
 * Three cases, in order:
 *   1. google_id already on file -> this is a returning user on
 *      (possibly) a brand new device. Google already handled
 *      re-authentication; we just verify the token and hand out a
 *      fresh access + refresh token pair, exactly like a normal
 *      login. This is what makes "new device" work for free — there
 *      is no device-binding anywhere in this flow, every call is
 *      independent and just asks "does this verified identity have
 *      an account, and if so here are new tokens for THIS session."
 *   2. No google_id match, but the email already exists as a
 *      password-provider account -> link Google to that same
 *      existing account rather than creating a duplicate. This
 *      matters: without it, someone who registered with email+
 *      password first and later taps "Sign in with Google" using
 *      the same email would silently get a second, disconnected
 *      account with the same email address, which the UNIQUE
 *      constraint on email would actually reject outright — so this
 *      isn't just nicer UX, it's required for the insert to succeed
 *      at all.
 *   3. No match at all -> brand new student account. Google's
 *      email_verified claim is trusted directly (Google itself
 *      already confirmed the mailbox), so email_verified is set true
 *      immediately — unlike password sign-up, there's no separate
 *      "click the link we emailed you" step needed here.
 */
export async function loginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
  // Security finding H7: only a mailbox Google itself has verified may
  // ever be associated with a MEALVEST account.
  if (!profile.emailVerified) {
    throw new ApiError(401, "GOOGLE_EMAIL_UNVERIFIED", "Your Google account's email address isn't verified. Verify it with Google, or sign in with your password.");
  }

  const byGoogleId = await findUserByGoogleId(profile.googleId);
  if (byGoogleId) {
    if (byGoogleId.account_status === "suspended") {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }
    // Google sign-in skips the PIN step, so it is only offered to
    // student accounts. Hotel and admin accounts must use password + PIN.
    if (byGoogleId.role !== "student") {
      throw new ApiError(403, "GOOGLE_LOGIN_NOT_ALLOWED", "Please sign in to this account with your password and PIN.");
    }
    const fullName = await lookupFullName(byGoogleId);
    return issueTokens(byGoogleId.id, byGoogleId.role, fullName, byGoogleId.email);
  }

  // NEVER link silently just because the email strings match: whoever
  // controls a Google identity for that address would otherwise take
  // over the existing (possibly hotel/admin) account and bypass its PIN.
  // The owner links explicitly, while signed in, by proving their
  // password (linkGoogleAccount below).
  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    throw new ApiError(
      409,
      "ACCOUNT_LINK_REQUIRED",
      "An account with this email already exists. Sign in with your password, then link Google from your profile."
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, google_id, role, auth_provider, email_verified, account_status)
       VALUES ($1, NULL, NULL, $2, 'student', 'google', $3, 'active')
       RETURNING id`,
      [profile.email.toLowerCase(), profile.googleId, profile.emailVerified]
    );
    const userId = userResult.rows[0].id as string;

    await client.query(`INSERT INTO students (user_id, full_name) VALUES ($1, $2)`, [userId, profile.name]);

    await client.query("COMMIT");
    return issueTokens(userId, "student", profile.name, profile.email);
  } catch (err) {
    await client.query("ROLLBACK");
    throw mapDbError(err);
  } finally {
    client.release();
  }
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const stored = await consumeForRotation(refreshToken, "rotated");

  const user = await findUserById(stored.user_id);
  if (!user || user.account_status === "suspended") {
    await revokeFamily(stored.family_id, "account_unavailable");
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
  }

  const fullName = await lookupFullName(user);
  return issueTokens(user.id, user.role, fullName, user.email, { familyId: stored.family_id, previousId: stored.id });
}

/** Logout ends the whole session family (this device's chain of rotated tokens). */
export async function logout(refreshToken: string): Promise<void> {
  const row = await findRefreshTokenByHashAnyState(hashRefreshToken(refreshToken));
  if (row) await revokeFamily(row.family_id, "logout");
}

export function decodeAccessToken(token: string) {
  return verifyAccessToken(token);
}

const PASSWORD_RESET_TTL_MINUTES = 30;

/**
 * Step 1 — always resolves successfully regardless of whether the
 * identifier matches a real account (same anti-enumeration philosophy
 * as login's generic INVALID_CREDENTIALS): the caller only ever learns
 * "check your email," never whether an account exists. A Google-only
 * account (no password_hash) has no password a reset would help —
 * quietly treated the same as no match at all, for the same reason.
 *
 * The email SEND failing (e.g. RESEND_API_KEY unset) is logged
 * server-side but never surfaces to the caller — surfacing it would
 * itself be an oracle (a real account triggers a send attempt and a
 * fake one doesn't), defeating the whole point of the generic response.
 */
export async function requestPasswordReset(identifier: string, resetBaseUrl: string | null): Promise<void> {
  const user = await findUserByEmailOrPhone(identifier);
  if (!user || !user.password_hash || user.account_status === "suspended") {
    // Same visible outcome and similar work as a real request (anti-enumeration).
    await hashPassword(identifier).catch(() => {});
    return;
  }
  if (!resetBaseUrl) {
    // M5: never build a link from the request's Host header. Without a
    // configured base URL we refuse to send rather than risk a poisoned link.
    console.error("[requestPasswordReset] APP_BASE_URL is not configured — reset email NOT sent.");
    return;
  }

  const token = generateRefreshToken().token;
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  // Only the newest link works: requesting again invalidates older ones.
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);
  await pool.query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    user.id,
    tokenHash,
    expiresAt,
  ]);

  const resetUrl = `${resetBaseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  // Sent after the response (similar latency for real and unknown accounts).
  runInBackground("password-reset-email", () => sendPasswordResetEmail(user.email, resetUrl));
}

/**
 * Step 2 — redeems the token ATOMICALLY (DELETE ... RETURNING: exactly
 * one concurrent redemption can win, so a token can never be replayed),
 * sets the new password, deletes every other outstanding reset token for
 * the account, and revokes every existing session.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  const result = await pool.query(
    "DELETE FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id",
    [tokenHash]
  );
  if (result.rows.length === 0) {
    throw new ApiError(400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Please request a new one.");
  }
  const userId = result.rows[0].user_id;

  const passwordHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, userId]);
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
  await revokeAllRefreshTokensForUser(userId, "password_reset");
  notificationEvents.securityPasswordChanged(userId);
}

const PIN_MAX_ATTEMPTS = 4;
const PIN_LOCKOUT_MINUTES = 15;

/**
 * Sets or replaces the caller's PIN. Requires the CURRENT password as
 * proof of intent — someone who merely has an already-open session
 * (e.g. picked up an unlocked phone) cannot silently plant their own
 * PIN for persistent quick-unlock access; they'd need the password
 * too. Any prior lockout/attempt count is cleared, matching "a fresh
 * PIN gets a fresh start."
 */
export async function setPin(userId: string, pin: string, currentPassword: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !user.password_hash) {
    throw new ApiError(400, "PASSWORD_LOGIN_REQUIRED", "This account cannot set a PIN without a password.");
  }
  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect password.");
  }
  const pinHash = await hashPassword(pin);
  await setUserPin(userId, pinHash);
}

/**
 * PIN-unlock: trades a still-valid refresh token + correct PIN for a
 * fresh access/refresh token pair, without asking for the password
 * again — this is what makes the PIN a quick re-entry into an
 * EXISTING session rather than a second, weaker login system. The
 * refresh token itself is only looked up here, never rotated/revoked
 * on a wrong PIN, so a mistyped PIN can never strand a legitimate
 * user — they can always fall back to a full password login (which
 * calls the ordinary /login route, untouched by any of this).
 */
export async function verifyPinAndRefresh(refreshToken: string, pin: string): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await findValidRefreshTokenByHash(tokenHash);
  if (!stored) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
  }

  const user = await findUserById(stored.user_id);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
  }
  // A wrong PIN never consumes the session (user can fall back to password login).
  await verifyPinForUser(user, pin);

  const consumed = await consumeForRotation(refreshToken, "pin_unlock");
  const fullName = await lookupFullName(user);
  return issueTokens(user.id, user.role, fullName, user.email, { familyId: consumed.family_id, previousId: consumed.id });
}

/**
 * Shared by both PIN paths — the mandatory second-factor step right
 * after a fresh password login (completeLoginWithPin) and the
 * app-relaunch quick-unlock (verifyPinAndRefresh above). One
 * lockout/attempt policy, enforced in exactly one place, so the two
 * flows can never drift apart on what "4 attempts" actually means.
 */
function pinLockedError(lockedUntil: string | null): ApiError {
  const minutesLeft = lockedUntil
    ? Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000))
    : PIN_LOCKOUT_MINUTES;
  return new ApiError(
    423,
    "PIN_LOCKED",
    `Too many incorrect PIN attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}, or log in with your password.`
  );
}

/**
 * Concurrency-safe PIN check (finding H4): an attempt is reserved
 * atomically BEFORE bcrypt runs (see userModel.reservePinAttempt), so
 * parallel wrong guesses cannot exceed PIN_MAX_ATTEMPTS per lockout.
 */
async function verifyPinForUser(user: UserRow, pin: string): Promise<void> {
  if (!user.pin_hash) {
    throw new ApiError(400, "PIN_NOT_SET", "No PIN has been set for this account yet.");
  }

  const reservation = await reservePinAttempt(user.id, PIN_MAX_ATTEMPTS);
  if (!reservation) {
    const { lockedUntil, busy } = await resolveRefusedPinAttempt(user.id, PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MINUTES);
    if (busy) {
      throw new ApiError(429, "PIN_TRY_AGAIN", "Please wait a moment and try your PIN again.");
    }
    throw pinLockedError(lockedUntil);
  }

  const valid = await verifyPassword(pin, reservation.pinHash);
  if (!valid) {
    const { attempts, lockedUntil } = await confirmPinFailure(user.id, PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MINUTES);
    if (lockedUntil) throw pinLockedError(lockedUntil);
    const remaining = Math.max(0, PIN_MAX_ATTEMPTS - attempts);
    throw new ApiError(401, "PIN_INCORRECT", `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`);
  }

  await releasePinReservationOnSuccess(user.id, reservation.reservedCount);
}

/** Step-up check for sensitive actions by an already signed-in user (e.g. savings withdrawal, M1). */
export async function verifyPinForUserId(userId: string, pin: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account cannot perform this action.");
  }
  await verifyPinForUser(user, pin);
}

async function assertNoDuplicateAccount(email: string, phoneNumber: string): Promise<void> {
  const existing = await findUserByEmailOrPhone(email);
  const existingByPhone = await findUserByEmailOrPhone(phoneNumber);
  if (existing || existingByPhone) {
    throw new ApiError(409, "ACCOUNT_EXISTS", "An account with this email or phone number already exists.");
  }
}

async function lookupFullName(user: UserRow): Promise<string> {
  if (user.role === "student") {
    const r = await pool.query("SELECT full_name FROM students WHERE user_id = $1", [user.id]);
    return r.rows[0]?.full_name ?? "";
  }
  if (user.role === "hotel_owner" || user.role === "hotel_staff") {
    const r = await pool.query("SELECT full_name FROM hotel_staff WHERE user_id = $1", [user.id]);
    return r.rows[0]?.full_name ?? "";
  }
  const r = await pool.query("SELECT full_name FROM admins WHERE user_id = $1", [user.id]);
  return r.rows[0]?.full_name ?? "";
}

function mapDbError(err: unknown): Error {
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === "23505") {
    // unique_violation — our pre-check should normally catch this
    // first, but a race between two simultaneous signups with the
    // same email/phone lands here instead. Same clear message either way.
    return new ApiError(409, "ACCOUNT_EXISTS", "An account with this email or phone number already exists.");
  }
  return err instanceof Error ? err : new Error("Unknown database error");
}

/**
 * Explicit, authenticated account linking (H7): a signed-in STUDENT
 * links a Google identity by proving their current password and
 * presenting a fresh, verified Google ID token. A Google identity can
 * belong to at most one user (users.google_id UNIQUE).
 */
export async function linkGoogleAccount(userId: string, profile: GoogleProfile, currentPassword: string): Promise<{ linked: true }> {
  if (!profile.emailVerified) {
    throw new ApiError(401, "GOOGLE_EMAIL_UNVERIFIED", "Your Google account's email address isn't verified.");
  }
  const user = await findUserById(userId);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account cannot be linked.");
  }
  if (user.role !== "student") {
    throw new ApiError(403, "GOOGLE_LOGIN_NOT_ALLOWED", "Only student accounts can sign in with Google.");
  }
  if (!user.password_hash || !(await verifyPassword(currentPassword, user.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect password.");
  }
  if (user.google_id && user.google_id !== profile.googleId) {
    throw new ApiError(409, "GOOGLE_ALREADY_LINKED", "A different Google account is already linked to this account.");
  }
  try {
    const result = await pool.query(
      "UPDATE users SET google_id = $1, updated_at = now() WHERE id = $2 AND (google_id IS NULL OR google_id = $1)",
      [profile.googleId, userId]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new ApiError(409, "GOOGLE_ALREADY_LINKED", "A different Google account is already linked to this account.");
    }
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new ApiError(409, "GOOGLE_IN_USE", "This Google account is already linked to another MEALVEST account.");
    }
    throw err;
  }
  return { linked: true };
}

/** Max age of a Google ID token accepted as step-up re-authentication. */
const GOOGLE_REAUTH_MAX_AGE_SECONDS = 10 * 60;

/**
 * Step-up authorization for a sensitive action (savings withdrawal, M1):
 *  - accounts WITH a PIN must enter it (same atomic lockout as login);
 *  - accounts WITHOUT a PIN (Google-only students have neither PIN nor
 *    password) must re-authenticate with a FRESH Google ID token for the
 *    SAME linked Google identity.
 * There is no path that authorizes the action with neither.
 */
export async function verifyStepUp(
  userId: string,
  proof: { pin?: string; googleIdToken?: string },
  verifyGoogle: (idToken: string) => Promise<GoogleProfile>
): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.account_status === "suspended") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account cannot perform this action.");
  }
  if (user.pin_hash) {
    if (!proof.pin) throw new ApiError(400, "PIN_REQUIRED", "Enter your 4-digit PIN to confirm.");
    await verifyPinForUser(user, proof.pin);
    return;
  }
  if (!user.google_id) {
    throw new ApiError(400, "PIN_REQUIRED", "Set up a PIN before making withdrawals.");
  }
  if (!proof.googleIdToken) {
    throw new ApiError(400, "REAUTH_REQUIRED", "Confirm with Google to continue.");
  }
  const profile = await verifyGoogle(proof.googleIdToken);
  const ageSeconds = Math.floor(Date.now() / 1000) - profile.issuedAt;
  if (profile.googleId !== user.google_id || !profile.emailVerified || ageSeconds > GOOGLE_REAUTH_MAX_AGE_SECONDS || ageSeconds < -60) {
    throw new ApiError(401, "REAUTH_FAILED", "Google confirmation failed. Please try again.");
  }
}
