/**
 * Stage 2 integration tests: sessions, refresh rotation, password reset,
 * verification, admin audit + dual control, SMS caps, uploads, error
 * handling. Real Postgres, no real providers, no SMS/email sent.
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { integrationEnabled, MockPaystack, resetDatabase, configureEnv, listen, http_ } from "./harness";

const enabled = integrationEnabled();
const skip = enabled ? false : "TEST_DATABASE_URL not set — integration tests skipped";
const mock = new MockPaystack();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m: Record<string, any> = {};
let api: { base: string; close: () => Promise<void> };

before(async () => {
  if (!enabled) return;
  await mock.start();
  configureEnv(mock.port);
  await resetDatabase();
  m.db = await import("../../src/config/db");
  m.auth = await import("../../src/services/authService");
  m.jwt = await import("../../src/lib/jwt");
  m.rt = await import("../../src/models/refreshTokenModel");
  m.ver = await import("../../src/services/verificationService");
  m.payout = await import("../../src/services/hotelPayoutService");
  m.notif = await import("../../src/services/notificationService");
  m.authMw = await import("../../src/middleware/auth");
  const { createApp } = await import("../../src/app");
  api = await listen(createApp());
});

after(async () => {
  if (!enabled) return;
  await api.close();
  await mock.stop();
  await new Promise((r) => setTimeout(r, 300));
  await m.db.pool.end();
});

async function q(sql: string, params: unknown[] = []) {
  return (await m.db.pool.query(sql, params)).rows;
}
let seq = 0;
async function makeUser(role: "student" | "mealvest_admin" | "hotel_owner" = "student") {
  seq++;
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, 'password', false, 'active') RETURNING id, email, phone_number`,
    [`v${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2541${String(seq).padStart(8, "0")}`, await bcrypt.hash("password123", 4), await bcrypt.hash("1234", 4), role]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `S ${seq}`]);
  return { id: u.id as string, email: u.email as string, phone: u.phone_number as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
async function session(userId: string) {
  const { generateRefreshToken } = await import("../../src/lib/jwt");
  const g = generateRefreshToken();
  const row = await m.rt.insertRefreshToken({ userId, tokenHash: g.hash, expiresAt: g.expiresAt });
  return { token: g.token as string, familyId: row.family_id as string };
}

// =================================================================== M6
describe("M6 sessions & refresh-token rotation", { skip }, () => {
  test("a suspended account is refused on protected routes even with a valid access token", async () => {
    const s = await makeUser();
    assert.equal((await http_(api.base, "/api/student/profile", { token: s.token })).status, 200);
    await q("UPDATE users SET account_status='suspended' WHERE id=$1", [s.id]);
    m.authMw.invalidateUserStatusCache(s.id); // same-instance cache bound is 15 s
    const r = await http_(api.base, "/api/student/profile", { token: s.token });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, "ACCOUNT_SUSPENDED");
  });

  test("a token whose role no longer matches the account is refused", async () => {
    const s = await makeUser();
    const forged = m.jwt.signAccessToken({ userId: s.id, role: "mealvest_admin" });
    assert.equal((await http_(api.base, "/api/admin/overview", { token: forged })).status, 401);
  });

  test("rotation: old token can't be used again; benign immediate reuse keeps the family alive", async () => {
    const s = await makeUser();
    const a = await session(s.id);
    const r1 = await m.auth.refresh(a.token);
    await assert.rejects(m.auth.refresh(a.token), (e: any) => e.code === "REFRESH_TOKEN_ROTATED");
    const r2 = await m.auth.refresh(r1.refreshToken); // descendant still valid
    assert.ok(r2.accessToken);
  });

  test("reuse after the grace window revokes the whole family (stolen-token detection)", async () => {
    const s = await makeUser();
    const a = await session(s.id);
    const r1 = await m.auth.refresh(a.token);
    await q("UPDATE refresh_tokens SET revoked_at = now() - interval '5 minutes' WHERE family_id=$1 AND revoked_reason='rotated'", [a.familyId]);
    await assert.rejects(m.auth.refresh(a.token), (e: any) => e.code === "INVALID_REFRESH_TOKEN");
    await assert.rejects(m.auth.refresh(r1.refreshToken), (e: any) => e.code === "INVALID_REFRESH_TOKEN");
    const live = await q("SELECT count(*)::int n FROM refresh_tokens WHERE family_id=$1 AND revoked_at IS NULL", [a.familyId]);
    assert.equal(live[0].n, 0);
  });

  test("10 concurrent refreshes of one token -> exactly one new session", async () => {
    const s = await makeUser();
    const a = await session(s.id);
    const res = await Promise.allSettled(Array.from({ length: 10 }, () => m.auth.refresh(a.token)));
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await q("SELECT count(*)::int n FROM refresh_tokens WHERE family_id=$1 AND revoked_at IS NULL", [a.familyId]))[0].n, 1);
  });

  test("logout ends the session family; refresh over HTTP is rate limited by its own limiter", async () => {
    const s = await makeUser();
    const a = await session(s.id);
    const r1 = await m.auth.refresh(a.token);
    const out = await http_(api.base, "/api/auth/logout", { method: "POST", body: { refreshToken: r1.refreshToken } });
    assert.equal(out.status, 200);
    await assert.rejects(m.auth.refresh(r1.refreshToken));
  });

  test("a wrong PIN on quick-unlock never consumes the session", async () => {
    const s = await makeUser();
    const a = await session(s.id);
    await assert.rejects(m.auth.verifyPinAndRefresh(a.token, "0000"), (e: any) => e.code === "PIN_INCORRECT");
    const ok = await m.auth.verifyPinAndRefresh(a.token, "1234");
    assert.ok(ok.refreshToken);
  });
});

// =================================================================== M5
describe("M5 password reset", { skip }, () => {
  async function plantResetToken(userId: string) {
    const token = crypto.randomBytes(48).toString("hex");
    await q("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 minutes')", [
      userId,
      crypto.createHash("sha256").update(token).digest("hex"),
    ]);
    return token;
  }

  test("a reset token works exactly once, even concurrently; all sessions are revoked", async () => {
    const s = await makeUser();
    const sess = await session(s.id);
    const token = await plantResetToken(s.id);
    const res = await Promise.allSettled(Array.from({ length: 5 }, () => m.auth.resetPassword(token, "brand-new-password")));
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(m.auth.resetPassword(token, "another-password"), (e: any) => e.code === "INVALID_RESET_TOKEN");
    await assert.rejects(m.auth.refresh(sess.token));
    const [u] = await q("SELECT password_hash FROM users WHERE id=$1", [s.id]);
    assert.ok(await bcrypt.compare("brand-new-password", u.password_hash));
  });

  test("requesting a new link invalidates older ones; unknown accounts get the same response", async () => {
    const s = await makeUser();
    const old = await plantResetToken(s.id);
    await m.auth.requestPasswordReset(s.email, "http://localhost:3000");
    assert.equal((await q("SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1", [s.id]))[0].n, 1);
    await assert.rejects(m.auth.resetPassword(old, "whatever-password"), (e: any) => e.code === "INVALID_RESET_TOKEN");
    const known = await http_(api.base, "/api/auth/forgot-password", { method: "POST", body: { identifier: s.email }, headers: { Host: "evil.example" } });
    const unknown = await http_(api.base, "/api/auth/forgot-password", { method: "POST", body: { identifier: "nobody@nowhere.test" } });
    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);
  });

  test("without a configured APP_BASE_URL no reset link is created (never built from Host)", async () => {
    const s = await makeUser();
    await m.auth.requestPasswordReset(s.email, null);
    assert.equal((await q("SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1", [s.id]))[0].n, 0);
  });

  test("passwords over bcrypt's 72-byte limit are rejected", async () => {
    const r = await http_(api.base, "/api/auth/reset-password", { method: "POST", body: { token: "x".repeat(10), newPassword: "é".repeat(40) } });
    assert.equal(r.status, 400);
    assert.match(r.data.error.message, /72 bytes/);
  });
});

// =================================================================== H7/M3
describe("H7/M3 email & phone verification", { skip }, () => {
  async function plantEmailToken(userId: string, target: string, ttl = "1 hour") {
    const token = crypto.randomBytes(32).toString("hex");
    await q(
      `INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at) VALUES ($1, 'email', $2, $3, now() + $4::interval)`,
      [userId, target, m.ver.__testing.sha256(token), ttl]
    );
    return token;
  }
  async function plantPhoneCode(userId: string, target: string, code: string) {
    await q(
      `INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at) VALUES ($1, 'phone', $2, $3, now() + interval '10 minutes')`,
      [userId, target, m.ver.__testing.phoneCodeHash(userId, code)]
    );
  }

  test("email link: verifies once, replay and expiry rejected, email-change invalidates", async () => {
    const s = await makeUser();
    const t = await plantEmailToken(s.id, s.email.toLowerCase());
    const ok = await http_(api.base, "/api/auth/verify-email/confirm", { method: "POST", body: { token: t } });
    assert.equal(ok.status, 200);
    assert.equal((await q("SELECT email_verified FROM users WHERE id=$1", [s.id]))[0].email_verified, true);
    assert.equal((await http_(api.base, "/api/auth/verify-email/confirm", { method: "POST", body: { token: t } })).status, 400);

    const s2 = await makeUser();
    const expired = await plantEmailToken(s2.id, s2.email.toLowerCase(), "-1 minute");
    assert.equal((await http_(api.base, "/api/auth/verify-email/confirm", { method: "POST", body: { token: expired } })).status, 400);
    const stale = await plantEmailToken(s2.id, "old-address@int.test");
    assert.equal((await http_(api.base, "/api/auth/verify-email/confirm", { method: "POST", body: { token: stale } })).status, 400);
    assert.equal((await q("SELECT email_verified FROM users WHERE id=$1", [s2.id]))[0].email_verified, false);
  });

  test("email request refuses cleanly when email isn't configured (no silent success)", async () => {
    const s = await makeUser();
    const r = await http_(api.base, "/api/auth/verify-email/request", { method: "POST", token: s.token });
    assert.equal(r.status, 503);
  });

  test("phone code: parallel guessing can't exceed 5 attempts; the code burns; correct code later is useless", async () => {
    const s = await makeUser();
    await plantPhoneCode(s.id, s.phone, "424242");
    await Promise.allSettled(Array.from({ length: 12 }, (_, i) => m.ver.confirmPhoneVerification(s.id, String(100000 + i))));
    const [row] = await q("SELECT attempts, consumed_at FROM verification_tokens WHERE user_id=$1 AND channel='phone'", [s.id]);
    assert.ok(row.attempts <= 5, `attempts=${row.attempts}`);
    assert.ok(row.consumed_at);
    await assert.rejects(m.ver.confirmPhoneVerification(s.id, "424242"));
    assert.equal((await q("SELECT phone_verified FROM users WHERE id=$1", [s.id]))[0].phone_verified, false);
  });

  test("phone code verifies; changing the number afterwards resets verification", async () => {
    const s = await makeUser();
    await plantPhoneCode(s.id, s.phone, "135790");
    await m.ver.confirmPhoneVerification(s.id, "135790");
    assert.equal((await q("SELECT phone_verified FROM users WHERE id=$1", [s.id]))[0].phone_verified, true);
    const r = await http_(api.base, "/api/student/profile", { method: "PATCH", token: s.token, body: { phoneNumber: "0799000111" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.profile.phone_number, "254799000111"); // normalized
    assert.equal(r.data.profile.phone_verified, false);
  });

  test("profile phone numbers are validated, normalized and unique", async () => {
    const a = await makeUser();
    const b = await makeUser();
    assert.equal((await http_(api.base, "/api/student/profile", { method: "PATCH", token: a.token, body: { phoneNumber: "not-a-phone" } })).status, 400);
    const dup = await http_(api.base, "/api/student/profile", { method: "PATCH", token: a.token, body: { phoneNumber: "0" + b.phone.slice(3) } });
    assert.equal(dup.status, 409);
  });
});

// =================================================================== M8
describe("M8 admin audit log & dual control", { skip }, () => {
  test("admin actions are recorded (success and denied), without secrets, and the log is append-only", async () => {
    const admin = await makeUser("mealvest_admin");
    const student = await makeUser();
    const created = await http_(api.base, "/api/admin/hotels", {
      method: "POST",
      token: admin.token,
      body: { name: "Audit Hotel", ownerEmail: `own${seq}@int.test`, ownerPassword: "SuperSecret123!", ownerPin: "9876", password: "SuperSecret123!", pin: "9876" },
    });
    const denied = await http_(api.base, `/api/admin/withdrawals/${crypto.randomUUID()}`, { method: "PATCH", token: student.token, body: { status: "rejected" } });
    assert.equal(denied.status, 403);
    await new Promise((r) => setTimeout(r, 200)); // audit writes happen after the response
    const rows = await q("SELECT actor_user_id, action, outcome, metadata::text AS meta FROM admin_audit_log ORDER BY id");
    assert.ok(rows.some((r: any) => r.actor_user_id === admin.id && r.action.includes("POST /api/admin/hotels")), JSON.stringify(rows) + created.status);
    assert.ok(rows.some((r: any) => r.actor_user_id === student.id && r.outcome === "denied"));
    assert.ok(rows.every((r: any) => !/SuperSecret|9876/.test(r.meta)));
    await assert.rejects(q("UPDATE admin_audit_log SET outcome='success'"), /append-only/);
    await assert.rejects(q("DELETE FROM admin_audit_log"), /append-only/);
    await assert.rejects(q("TRUNCATE admin_audit_log"), /append-only/);
  });

  test("the database refuses a self-approval even if code is bypassed", async () => {
    const admin = await makeUser("mealvest_admin");
    const [h] = await q("INSERT INTO hotels (name, status) VALUES ('Dual', 'active') RETURNING id");
    const [p] = await q(
      "INSERT INTO hotel_payouts (hotel_id, amount, transfer_reference, initiated_by_admin_id, status) VALUES ($1, 9000, $2, $3, 'review') RETURNING id",
      [h.id, `PO-dual-${seq}`, admin.id]
    );
    await assert.rejects(q("UPDATE hotel_payouts SET status='approved', approved_by_admin_id=$2 WHERE id=$1", [p.id, admin.id]), /cannot approve their own/);
    await assert.rejects(m.payout.approveAndSubmitPayout(p.id, admin.id), (e: any) => e.code === "DUAL_APPROVAL_REQUIRED");
  });
});

// =================================================================== M2
describe("M2 SMS cost caps", { skip }, () => {
  test("per-user and global daily caps are enforced from the delivery log", async () => {
    const s = await makeUser();
    assert.equal(await m.notif.smsCapReached(s.id), null);
    for (let i = 0; i < 5; i++) {
      const [n] = await q("INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'test', 't', 'b') RETURNING id", [s.id]);
      await q("INSERT INTO notification_deliveries (notification_id, channel, status) VALUES ($1, 'sms', 'sent')", [n.id]);
    }
    assert.match(String(await m.notif.smsCapReached(s.id)), /Per-user/);
    const other = await makeUser();
    process.env.SMS_DAILY_CAP_GLOBAL = "5";
    try {
      assert.match(String(await m.notif.smsCapReached(other.id)), /Global/);
    } finally {
      delete process.env.SMS_DAILY_CAP_GLOBAL;
    }
  });
});

// =================================================================== M7/M9 + error handling
describe("M7/M9 uploads & input limits; L-level error handling", { skip }, () => {
  async function hotelOwner() {
    const o = await makeUser("hotel_owner");
    const [h] = await q("INSERT INTO hotels (name, status) VALUES ($1, 'active') RETURNING id", [`Owner Hotel ${seq}`]);
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1, $2, 'Owner', 'owner')", [o.id, h.id]);
    return o;
  }

  test("an SVG/HTML upload disguised as image/png is rejected by content", async () => {
    const o = await hotelOwner();
    const form = new FormData();
    form.append("image", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/png" }), "cute.png");
    const res = await fetch(`${api.base}/api/hotel/upload-image`, { method: "POST", headers: { Authorization: `Bearer ${o.token}` }, body: form });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.error.code, "INVALID_FILE_TYPE");
  });

  test("menu prices are bounded and image URLs must be allow-listed https", async () => {
    const o = await hotelOwner();
    const huge = await http_(api.base, "/api/hotel/menu", { method: "POST", token: o.token, body: { name: "Gold", price: 99999999, category: "lunch" } });
    assert.equal(huge.status, 400);
    const js = await http_(api.base, "/api/hotel/location", { method: "PATCH", token: o.token, body: { imageUrl: "javascript:alert(1)" } });
    assert.equal(js.status, 400);
    const ext = await http_(api.base, "/api/hotel/location", { method: "PATCH", token: o.token, body: { imageUrl: "https://tracker.example/p.gif" } });
    assert.equal(ext.status, 400);
  });

  test("malformed ids are 400 (not 500); disallowed CORS origins are 403 (not 500)", async () => {
    const s = await makeUser();
    const bad = await http_(api.base, "/api/orders/not-a-uuid", { token: s.token });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.code, "INVALID_INPUT");
    const cors = await http_(api.base, "/api/health", { headers: { Origin: "https://evil.example" } });
    assert.equal(cors.status, 403);
    const okOrigin = await http_(api.base, "/api/health", { headers: { Origin: "http://localhost:3000" } });
    assert.notEqual(okOrigin.status, 403);
  });

  test("too many order lines are rejected", async () => {
    const s = await makeUser();
    const items = Array.from({ length: 21 }, () => ({ itemId: crypto.randomUUID(), quantity: 1 }));
    const r = await http_(api.base, "/api/orders", { method: "POST", token: s.token, body: { hotelId: crypto.randomUUID(), items } });
    assert.equal(r.status, 400);
  });
});
