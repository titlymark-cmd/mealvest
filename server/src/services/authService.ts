import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { hashPassword, verifyPassword } from "../lib/password";
import { normalizeKenyanPhone } from "../lib/phone";
import { signAccessToken, generateRefreshToken, hashRefreshToken, verifyAccessToken } from "../lib/jwt";
import {
  insertRefreshToken,
  findValidRefreshTokenByHash,
  revokeRefreshTokenByHash,
} from "../models/refreshTokenModel";
import { findUserByEmailOrPhone, findUserByGoogleId, UserRow } from "../models/userModel";
import { GoogleProfile } from "../lib/googleAuth";
import { Role } from "../types/roles";
import { RegisterStudentInput, RegisterHotelInput, LoginInput } from "../schemas/authSchemas";

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: Role; fullName: string; email: string };
}

async function issueTokens(userId: string, role: Role, fullName: string, email: string): Promise<AuthResult> {
  const accessToken = signAccessToken({ userId, role });
  const { token: refreshToken, hash, expiresAt } = generateRefreshToken();
  await insertRefreshToken({ userId, tokenHash: hash, expiresAt });
  return { accessToken, refreshToken, user: { id: userId, role, fullName, email } };
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, 'student', 'password', false, 'active')
       RETURNING id`,
      [input.email.toLowerCase(), normalizedPhone, passwordHash]
    );
    const userId = userResult.rows[0].id as string;

    await client.query(
      `INSERT INTO students (user_id, full_name, institution, admission_number)
       VALUES ($1, $2, $3, $4)`,
      [userId, input.fullName, input.institution ?? null, input.admissionNumber ?? null]
    );

    await client.query("COMMIT");
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
      `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, 'hotel_owner', 'password', false, 'pending_verification')
       RETURNING id`,
      [input.email.toLowerCase(), normalizedPhone, passwordHash]
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

export async function login(input: LoginInput): Promise<AuthResult> {
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
  const byGoogleId = await findUserByGoogleId(profile.googleId);
  if (byGoogleId) {
    if (byGoogleId.account_status === "suspended") {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }
    const fullName = await lookupFullName(byGoogleId);
    return issueTokens(byGoogleId.id, byGoogleId.role, fullName, byGoogleId.email);
  }

  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    if (byEmail.account_status === "suspended") {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }
    // Link: same person, different sign-in method than they used
    // before. Their existing password (if any) is left completely
    // untouched — google_id is simply added as an additional way in.
    await pool.query("UPDATE users SET google_id = $1, updated_at = now() WHERE id = $2", [
      profile.googleId,
      byEmail.id,
    ]);
    const fullName = await lookupFullName(byEmail);
    return issueTokens(byEmail.id, byEmail.role, fullName, byEmail.email);
  }

  // Brand new account. No phone number available from Google — see
  // migration 016, phone_number is optional for non-password
  // accounts and can be added later from the student's profile
  // screen (needed eventually for M-Pesa, not for sign-in itself).
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
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await findValidRefreshTokenByHash(tokenHash);
  if (!stored) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
  }

  // Rotate: the old refresh token is revoked and a new one issued on
  // every refresh. This limits how long a stolen refresh token stays
  // useful — if the legitimate client tries to use the now-revoked
  // token later, that's a signal the token was stolen and replayed.
  await revokeRefreshTokenByHash(tokenHash);

  const userResult = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [stored.user_id]);
  const user = userResult.rows[0];
  if (!user || user.account_status === "suspended") {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Session expired. Please log in again.");
  }

  const fullName = await lookupFullName(user);
  return issueTokens(user.id, user.role, fullName, user.email);
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await revokeRefreshTokenByHash(tokenHash);
}

export function decodeAccessToken(token: string) {
  return verifyAccessToken(token);
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
