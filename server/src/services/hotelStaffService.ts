import crypto from "crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { invalidateUserStatusCache } from "../middleware/auth";
import { hashPassword } from "../lib/password";
import { normalizeKenyanPhone } from "../lib/phone";
import { issuePasswordSetupToken } from "./authService";
import { sendStaffInviteEmail, isEmailConfigured, emailConfigProblem } from "./emailService";

/**
 * Owner-managed hotel staff accounts.
 *
 * Security model
 *  - The hotel is ALWAYS resolved from the authenticated owner's own
 *    hotel_staff row — never from a client-supplied hotel id — and every
 *    lookup of a target staff member is scoped to that hotel, so an owner can
 *    never see, change or even confirm the existence of another hotel's staff.
 *  - Only an ACTIVE hotel_staff row with permission_level = 'owner' can manage
 *    staff. Staff accounts (permission_level = 'staff') are refused, even if the
 *    route guard were ever loosened.
 *  - No password is ever chosen, shown or returned. A staff account starts with
 *    an unguessable random password hash; the staff member receives an emailed,
 *    single-use, expiring link (the same hashed-token mechanism as password
 *    reset) and sets their own password. They create their PIN at first sign-in.
 *  - Deactivation is a soft state: the row, their orders and audit records stay;
 *    access is cut at every entry point (middleware, login, PIN unlock, refresh,
 *    push) and all sessions are revoked.
 */

export const STAFF_INVITE_TTL_HOURS = 72;
export const MAX_STAFF_PER_HOTEL = 20;

export type StaffStatus = "owner" | "active" | "invited" | "deactivated";

export interface StaffMember {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  permissionLevel: "owner" | "staff";
  status: StaffStatus;
  emailVerified: boolean;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  /** Meals this person has redeemed at the counter (all time). */
  redemptions: number;
}

interface Row {
  user_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  permission_level: "owner" | "staff";
  is_active: boolean;
  activated_at: Date | null;
  deactivated_at: Date | null;
  created_at: Date;
  email_verified: boolean;
  redemptions: number;
}

function toMember(r: Row): StaffMember {
  let status: StaffStatus;
  if (r.permission_level === "owner") status = "owner";
  else if (!r.is_active) status = "deactivated";
  else if (!r.activated_at) status = "invited";
  else status = "active";
  return {
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    phoneNumber: r.phone_number,
    permissionLevel: r.permission_level,
    status,
    emailVerified: r.email_verified,
    createdAt: new Date(r.created_at).toISOString(),
    activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at).toISOString() : null,
    redemptions: r.redemptions,
  };
}

const MEMBER_SELECT = `
  SELECT hs.user_id, hs.full_name, u.email, u.phone_number, hs.permission_level, hs.is_active,
         hs.activated_at, hs.deactivated_at, hs.created_at, u.email_verified,
         (SELECT count(*)::int FROM orders o WHERE o.redeemed_by_hotel_user_id = hs.user_id) AS redemptions
    FROM hotel_staff hs JOIN users u ON u.id = hs.user_id`;

interface OwnerContext {
  hotelId: string;
  hotelName: string;
  ownerName: string;
}

/** Resolves the hotel from the caller's own owner row. Refuses non-owners, deactivated owners and suspended hotels. */
async function resolveOwner(ownerUserId: string): Promise<OwnerContext> {
  const r = await pool.query<{ hotel_id: string; hotel_name: string; full_name: string; permission_level: string; is_active: boolean; status: string }>(
    `SELECT hs.hotel_id, h.name AS hotel_name, hs.full_name, hs.permission_level, hs.is_active, h.status
       FROM hotel_staff hs JOIN hotels h ON h.id = hs.hotel_id
      WHERE hs.user_id = $1`,
    [ownerUserId]
  );
  const row = r.rows[0];
  if (!row || row.permission_level !== "owner" || !row.is_active) {
    throw new ApiError(403, "FORBIDDEN", "Only the hotel owner can manage staff.");
  }
  if (row.status !== "active") {
    throw new ApiError(403, "HOTEL_SUSPENDED", "This hotel account is not currently active.");
  }
  return { hotelId: row.hotel_id, hotelName: row.hotel_name, ownerName: row.full_name };
}

async function logEvent(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  hotelId: string,
  staffUserId: string,
  actorUserId: string,
  action: "created" | "invite_resent" | "deactivated" | "reactivated"
): Promise<void> {
  await client.query(
    "INSERT INTO hotel_staff_events (hotel_id, staff_user_id, actor_user_id, action) VALUES ($1, $2, $3, $4)",
    [hotelId, staffUserId, actorUserId, action]
  );
}

export async function listStaff(ownerUserId: string): Promise<{ staff: StaffMember[]; limit: number }> {
  const { hotelId } = await resolveOwner(ownerUserId);
  const r = await pool.query<Row>(
    `${MEMBER_SELECT} WHERE hs.hotel_id = $1 ORDER BY (hs.permission_level = 'owner') DESC, hs.is_active DESC, hs.created_at ASC`,
    [hotelId]
  );
  return { staff: r.rows.map(toMember), limit: MAX_STAFF_PER_HOTEL };
}

export async function getStaffMember(ownerUserId: string, staffUserId: string): Promise<StaffMember> {
  const { hotelId } = await resolveOwner(ownerUserId);
  return loadMember(hotelId, staffUserId);
}

async function loadMember(hotelId: string, staffUserId: string): Promise<StaffMember> {
  const r = await pool.query<Row>(`${MEMBER_SELECT} WHERE hs.hotel_id = $1 AND hs.user_id = $2`, [hotelId, staffUserId]);
  // Same answer whether the id doesn't exist or belongs to another hotel.
  if (!r.rows[0]) throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member not found.");
  return toMember(r.rows[0]);
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  phoneNumber: string;
}

export async function createStaff(
  ownerUserId: string,
  input: CreateStaffInput
): Promise<{ staff: StaffMember; inviteSent: boolean; inviteError?: string }> {
  const ctx = await resolveOwner(ownerUserId);

  // Staff are invited by email, so refuse up front (before creating anything) when email can't be sent.
  if (!isEmailConfigured()) {
    console.error(`[hotelStaff] cannot invite: ${emailConfigProblem()}`);
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Staff invitations need email to be set up on this server first.");
  }

  const phone = normalizeKenyanPhone(input.phoneNumber);
  if (!phone) throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
  const email = input.email.trim().toLowerCase();

  // Unguessable placeholder password: nobody — including the owner — knows it. The real
  // password is set by the staff member through the invite link.
  const placeholderHash = await hashPassword(crypto.randomBytes(32).toString("hex"));

  const client = await pool.connect();
  let userId: string;
  try {
    await client.query("BEGIN");
    // Serialise per hotel so two simultaneous invites can't both squeeze past the cap.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`staff:${ctx.hotelId}`]);

    const count = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM hotel_staff WHERE hotel_id = $1 AND permission_level = 'staff' AND is_active = true",
      [ctx.hotelId]
    );
    if (count.rows[0].n >= MAX_STAFF_PER_HOTEL) {
      throw new ApiError(409, "STAFF_LIMIT_REACHED", `A hotel can have at most ${MAX_STAFF_PER_HOTEL} active staff accounts.`);
    }

    const dup = await client.query(
      "SELECT 1 FROM users WHERE lower(email) = $1 OR phone_number = $2 LIMIT 1",
      [email, phone]
    );
    if (dup.rows.length > 0) {
      throw new ApiError(409, "ACCOUNT_EXISTS", "An account with this email or phone number already exists.");
    }

    const u = await client.query<{ id: string }>(
      `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, NULL, 'hotel_staff', 'password', false, 'active') RETURNING id`,
      [email, phone, placeholderHash]
    );
    userId = u.rows[0].id;
    await client.query(
      `INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level, invited_by, activated_at)
       VALUES ($1, $2, $3, 'staff', $4, NULL)`,
      [userId, ctx.hotelId, input.fullName.trim(), ownerUserId]
    );
    await logEvent(client, ctx.hotelId, userId, ownerUserId, "created");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string }).code === "23505") {
      throw new ApiError(409, "ACCOUNT_EXISTS", "An account with this email or phone number already exists.");
    }
    throw err;
  } finally {
    client.release();
  }

  const staff = await loadMember(ctx.hotelId, userId);
  try {
    await sendInvite(ctx, userId, email, input.fullName.trim());
    return { staff, inviteSent: true };
  } catch {
    // The account exists (created atomically); only the email failed. The owner can resend.
    return {
      staff,
      inviteSent: false,
      inviteError: "The account was created, but we couldn't send the invitation email. Use “Resend invite” to try again.",
    };
  }
}

async function sendInvite(ctx: OwnerContext, staffUserId: string, email: string, staffName: string): Promise<void> {
  const token = await issuePasswordSetupToken(staffUserId, STAFF_INVITE_TTL_HOURS * 60);
  try {
    await sendStaffInviteEmail(email, {
      hotelName: ctx.hotelName,
      inviterName: ctx.ownerName,
      staffName,
      inviteUrl: `${env.appBaseUrl}/reset-password?token=${token}&invite=1`,
      ttlHours: STAFF_INVITE_TTL_HOURS,
    });
  } catch (err) {
    // Undelivered link: don't leave a live token behind that nobody received.
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [staffUserId]).catch(() => {});
    throw err;
  }
}

export async function resendInvite(ownerUserId: string, staffUserId: string): Promise<{ inviteSent: true }> {
  const ctx = await resolveOwner(ownerUserId);
  if (!isEmailConfigured()) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Staff invitations need email to be set up on this server first.");
  const m = await loadMember(ctx.hotelId, staffUserId);
  if (m.status !== "invited") {
    throw new ApiError(409, "INVITE_NOT_PENDING", m.status === "deactivated" ? "Reactivate this person first." : "This person has already set up their account.");
  }
  // Per-person cooldown: stops an owner (or a stolen owner session) using this to spam an address.
  const recent = await pool.query(
    "SELECT 1 FROM hotel_staff_events WHERE staff_user_id = $1 AND action IN ('created','invite_resent') AND created_at > now() - interval '60 seconds'",
    [staffUserId]
  );
  if (recent.rows.length > 0) {
    throw new ApiError(429, "INVITE_COOLDOWN", "An invitation was just sent. Please wait a minute before resending.");
  }
  try {
    await sendInvite(ctx, staffUserId, m.email, m.fullName);
  } catch {
    throw new ApiError(502, "EMAIL_SEND_FAILED", "We couldn't send the invitation email right now. Please try again in a few minutes.");
  }
  await logEvent(pool, ctx.hotelId, staffUserId, ownerUserId, "invite_resent");
  return { inviteSent: true };
}

export async function deactivateStaff(ownerUserId: string, staffUserId: string): Promise<StaffMember> {
  const ctx = await resolveOwner(ownerUserId);
  if (staffUserId === ownerUserId) {
    throw new ApiError(400, "CANNOT_DEACTIVATE_SELF", "You can't deactivate your own account.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Scoped to the owner's hotel: another hotel's staff id simply isn't found.
    const r = await client.query<{ permission_level: string; is_active: boolean }>(
      "SELECT permission_level, is_active FROM hotel_staff WHERE user_id = $1 AND hotel_id = $2 FOR UPDATE",
      [staffUserId, ctx.hotelId]
    );
    const row = r.rows[0];
    if (!row) throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member not found.");
    if (row.permission_level === "owner") {
      throw new ApiError(400, "CANNOT_DEACTIVATE_OWNER", "The hotel owner account can't be deactivated.");
    }
    if (row.is_active) {
      await client.query(
        "UPDATE hotel_staff SET is_active = false, deactivated_at = now(), deactivated_by = $2 WHERE user_id = $1",
        [staffUserId, ownerUserId]
      );
      // Kill every way back in: sessions, half-finished logins, outstanding invite/reset links, push devices.
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'staff_deactivated' WHERE user_id = $1 AND revoked_at IS NULL",
        [staffUserId]
      );
      await client.query("DELETE FROM pending_login_tokens WHERE user_id = $1", [staffUserId]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [staffUserId]);
      await client.query("UPDATE notification_devices SET enabled = false WHERE user_id = $1", [staffUserId]);
      await logEvent(client, ctx.hotelId, staffUserId, ownerUserId, "deactivated");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  invalidateUserStatusCache(staffUserId); // immediate on this instance; other instances catch up within the 15s status cache
  return loadMember(ctx.hotelId, staffUserId);
}

export async function reactivateStaff(ownerUserId: string, staffUserId: string): Promise<StaffMember> {
  const ctx = await resolveOwner(ownerUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`staff:${ctx.hotelId}`]);
    const r = await client.query<{ permission_level: string; is_active: boolean }>(
      "SELECT permission_level, is_active FROM hotel_staff WHERE user_id = $1 AND hotel_id = $2 FOR UPDATE",
      [staffUserId, ctx.hotelId]
    );
    const row = r.rows[0];
    if (!row) throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member not found.");
    if (row.permission_level === "owner") throw new ApiError(400, "CANNOT_MODIFY_OWNER", "The hotel owner account can't be changed here.");

    // An admin suspension is a separate, stronger state an owner must not be able to undo.
    const acct = await client.query<{ account_status: string }>("SELECT account_status FROM users WHERE id = $1", [staffUserId]);
    if (acct.rows[0]?.account_status === "suspended") {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account was suspended by MEALVEST and can't be reactivated by the hotel.");
    }

    if (!row.is_active) {
      const count = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM hotel_staff WHERE hotel_id = $1 AND permission_level = 'staff' AND is_active = true",
        [ctx.hotelId]
      );
      if (count.rows[0].n >= MAX_STAFF_PER_HOTEL) {
        throw new ApiError(409, "STAFF_LIMIT_REACHED", `A hotel can have at most ${MAX_STAFF_PER_HOTEL} active staff accounts.`);
      }
      await client.query(
        "UPDATE hotel_staff SET is_active = true, deactivated_at = NULL, deactivated_by = NULL WHERE user_id = $1",
        [staffUserId]
      );
      await logEvent(client, ctx.hotelId, staffUserId, ownerUserId, "reactivated");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  invalidateUserStatusCache(staffUserId);
  return loadMember(ctx.hotelId, staffUserId);
}
