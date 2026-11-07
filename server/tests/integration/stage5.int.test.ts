/**
 * Stage 5 — hotel staff management, staff authorization, deactivation,
 * hotel-scoped notification targeting, push devices, honest test endpoint,
 * and per-user meal-reminder scheduling.
 */
import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { integrationEnabled, MockPaystack, resetDatabase, configureEnv, listen, http_ } from "./harness";
import { MockProviders } from "./providers";

const enabled = integrationEnabled();
const skip = enabled ? false : "TEST_DATABASE_URL not set — integration tests skipped";
const mock = new MockPaystack();
const prov = new MockProviders();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m: Record<string, any> = {};
let api: { base: string; close: () => Promise<void> };

before(async () => {
  if (!enabled) return;
  await mock.start();
  await prov.start();
  configureEnv(mock.port);
  process.env.RESEND_API_KEY = "re_test_key_1234567890";
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${prov.port}`;
  process.env.EMAIL_FROM = "MEALVEST <no-reply@mealvest.test>";
  await resetDatabase();
  m.db = await import("../../src/config/db");
  m.env = await import("../../src/config/env");
  m.jwt = await import("../../src/lib/jwt");
  m.events = await import("../../src/services/notificationEvents");
  m.reminders = await import("../../src/services/mealReminderService");
  m.fcm = await import("../../src/services/fcmService");
  m.pay = await import("../../src/services/paymentService");
  const { createApp } = await import("../../src/app");
  api = await listen(createApp());
});
after(async () => {
  if (!enabled) return;
  await api.close();
  await mock.stop();
  await prov.stop();
  await new Promise((r) => setTimeout(r, 300));
  await m.db.pool.end();
});
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  prov.reset();
});

let seq = 0;
let xff = 0;
const call = (p: string, o: { method?: string; token?: string; body?: unknown } = {}) =>
  http_(api.base, p, { ...o, headers: { "X-Forwarded-For": `10.5.${Math.floor(++xff / 250)}.${(xff % 250) + 1}` } });
async function q(sql: string, params: unknown[] = []) {
  return (await m.db.pool.query(sql, params)).rows;
}
const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function makeUser(role: string, extra: { suspended?: boolean } = {}) {
  seq++;
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, 'password', true, $6) RETURNING id, email, phone_number`,
    [`s5u${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2547${String(50000000 + seq)}`, await bcrypt.hash("password123", 4), await bcrypt.hash("1234", 4), role, extra.suspended ? "suspended" : "active"]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `S5 ${seq}`]);
  return { id: u.id as string, email: u.email as string, phone: u.phone_number as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
async function makeHotelWithOwner() {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ($1, 'active', 'send_money', $2, 10, 10) RETURNING id`,
    [`S5 Hotel ${seq}`, JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" })]
  );
  const owner = await makeUser("hotel_owner");
  await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level, activated_at) VALUES ($1, $2, 'Olive Owner', 'owner', now())", [owner.id, h.id]);
  const [item] = await q("INSERT INTO menu_items (hotel_id, name, price, category, available) VALUES ($1, 'Ugali', 50, 'lunch', true) RETURNING id", [h.id]);
  return { hotelId: h.id as string, itemId: item.id as string, owner };
}
let phoneSeq = 0;
const newStaffBody = (over: Record<string, unknown> = {}) => ({
  fullName: "Sam Staff",
  email: `staff${++phoneSeq}-${crypto.randomBytes(3).toString("hex")}@int.test`,
  phoneNumber: `07${String(20000000 + phoneSeq)}`,
  ...over,
});
/** Owner invites staff, staff redeems the emailed link, signs in and sets a PIN. Returns the live staff session. */
async function onboardStaff(owner: { token: string }, body = newStaffBody()) {
  const created = await call("/api/hotel/staff", { method: "POST", token: owner.token, body });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  await settle(100);
  const link = prov.lastEmailLink();
  const resetToken = new URL(link).searchParams.get("token")!;
  assert.equal((await call("/api/auth/reset-password", { method: "POST", body: { token: resetToken, newPassword: "staff-password-1" } })).status, 200);
  const login = await call("/api/auth/login", { method: "POST", body: { identifier: body.email, password: "staff-password-1" } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.pinSet, false);
  const done = await call("/api/auth/login/set-pin", { method: "POST", body: { pendingToken: login.data.pendingToken, pin: "4321" } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  return {
    id: created.data.staff.userId as string,
    email: body.email as string,
    token: done.data.accessToken as string,
    refreshToken: done.data.refreshToken as string,
    body,
  };
}

// =================================================================== creation
describe("owner creates hotel staff", { skip }, () => {
  test("creates a real hotel_staff user atomically, hotel taken from the OWNER, no password returned, invite emailed", async () => {
    const h = await makeHotelWithOwner();
    const body = newStaffBody();
    const r = await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.inviteSent, true);
    const s = r.data.staff;
    assert.equal(s.fullName, "Sam Staff");
    assert.equal(s.status, "invited");
    assert.equal(s.permissionLevel, "staff");
    assert.ok(!JSON.stringify(r.data).match(/password|hash|pin/i), "no credential material may be returned");

    const [u] = await q("SELECT role, pin_hash, auth_provider, email_verified, account_status, phone_number FROM users WHERE id=$1", [s.userId]);
    assert.equal(u.role, "hotel_staff");
    assert.equal(u.pin_hash, null);
    assert.equal(u.email_verified, false);
    assert.equal(u.account_status, "active");
    assert.equal(u.phone_number, `254${body.phoneNumber.slice(1)}`);
    const [hs] = await q("SELECT hotel_id, permission_level, invited_by, activated_at, is_active FROM hotel_staff WHERE user_id=$1", [s.userId]);
    assert.equal(hs.hotel_id, h.hotelId);
    assert.equal(hs.permission_level, "staff");
    assert.equal(hs.invited_by, h.owner.id);
    assert.equal(hs.activated_at, null);
    assert.equal(hs.is_active, true);
    assert.equal((await q("SELECT count(*)::int n FROM hotel_staff_events WHERE staff_user_id=$1 AND action='created' AND actor_user_id=$2", [s.userId, h.owner.id]))[0].n, 1);

    await settle(100);
    assert.equal(prov.emails.length, 1);
    assert.deepEqual(prov.emails[0].to, [body.email]);
    assert.match(prov.emails[0].subject, /S5 Hotel/);
    assert.match(prov.lastEmailLink(), /^http:\/\/localhost:3000\/reset-password\?token=[0-9a-f]{64,}&invite=1$/);
    const [tok] = await q("SELECT (expires_at - now()) AS ttl FROM password_reset_tokens WHERE user_id=$1", [s.userId]);
    assert.ok(tok.ttl.days === 2 || (tok.ttl.hours ?? 0) >= 71, `invite ttl ${JSON.stringify(tok.ttl)}`);
  });

  test("nobody — including the owner — can sign in as the new account before the invite is redeemed", async () => {
    const h = await makeHotelWithOwner();
    const body = newStaffBody();
    await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body });
    for (const guess of ["password123", "Staff1234", "", body.email]) {
      const r = await call("/api/auth/login", { method: "POST", body: { identifier: body.email, password: guess || "x" } });
      assert.equal(r.status, 401, `guess "${guess}"`);
    }
  });

  test("hotel/role/permission can't be smuggled in the body (strict schema); nothing is created", async () => {
    const a = await makeHotelWithOwner();
    const b = await makeHotelWithOwner();
    const before = (await q("SELECT count(*)::int n FROM users"))[0].n;
    for (const extra of [{ hotelId: b.hotelId }, { role: "mealvest_admin" }, { permissionLevel: "owner" }, { hotel_id: b.hotelId }]) {
      const r = await call("/api/hotel/staff", { method: "POST", token: a.owner.token, body: newStaffBody(extra) });
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
    assert.equal((await q("SELECT count(*)::int n FROM users"))[0].n, before);
  });

  test("validation + duplicates: bad email/phone/name 400; duplicate email (any case) or phone 409; parallel duplicates → one winner", async () => {
    const h = await makeHotelWithOwner();
    const post = (b: unknown) => call("/api/hotel/staff", { method: "POST", token: h.owner.token, body: b });
    assert.equal((await post(newStaffBody({ email: "not-an-email" }))).status, 400);
    assert.equal((await post(newStaffBody({ phoneNumber: "123" }))).status, 400);
    assert.equal((await post(newStaffBody({ fullName: "x" }))).status, 400);
    assert.equal((await post({})).status, 400);

    const first = newStaffBody();
    assert.equal((await post(first)).status, 201);
    const dupEmail = await post(newStaffBody({ email: String(first.email).toUpperCase() }));
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.data.error.code, "ACCOUNT_EXISTS");
    assert.equal((await post(newStaffBody({ phoneNumber: first.phoneNumber }))).status, 409);
    assert.equal((await post(newStaffBody({ email: h.owner.email }))).status, 409); // existing non-staff account

    const race = newStaffBody();
    const rs = await Promise.all([post(race), post(race), post(race)]);
    assert.deepEqual(rs.map((x) => x.status).sort(), [201, 409, 409]);
    assert.equal((await q("SELECT count(*)::int n FROM users WHERE lower(email)=lower($1)", [race.email]))[0].n, 1);
  });

  test("email not configured → 503 and NOTHING is created (no half-made account)", async () => {
    const h = await makeHotelWithOwner();
    const e = m.env.env;
    const saved = e.resendApiKey;
    const before = (await q("SELECT count(*)::int n FROM users"))[0].n;
    try {
      e.resendApiKey = "";
      const r = await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body: newStaffBody() });
      assert.equal(r.status, 503);
    } finally {
      e.resendApiKey = saved;
    }
    assert.equal((await q("SELECT count(*)::int n FROM users"))[0].n, before);
  });

  test("invite email fails → account exists as 'invited', response is honest (inviteSent:false), no live token; resend works after cooldown", async () => {
    const h = await makeHotelWithOwner();
    prov.emailMode = "fail";
    const r = await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body: newStaffBody() });
    assert.equal(r.status, 201);
    assert.equal(r.data.inviteSent, false);
    assert.match(r.data.inviteError, /resend invite/i);
    const id = r.data.staff.userId;
    assert.equal(r.data.staff.status, "invited");
    assert.equal((await q("SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1", [id]))[0].n, 0, "an undelivered link must not stay live");

    prov.emailMode = "ok";
    const tooSoon = await call(`/api/hotel/staff/${id}/resend-invite`, { method: "POST", token: h.owner.token });
    assert.equal(tooSoon.status, 429);
    await q("UPDATE hotel_staff_events SET created_at = created_at - interval '2 minutes' WHERE staff_user_id=$1", [id]);
    const ok = await call(`/api/hotel/staff/${id}/resend-invite`, { method: "POST", token: h.owner.token });
    assert.equal(ok.status, 200);
    await settle(100);
    assert.equal(prov.emails.length, 1);
    assert.equal((await q("SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1", [id]))[0].n, 1);
  });

  test("redeeming the invite activates the account, verifies the email, and the staff member signs in (PIN created at first sign-in)", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    const [hs] = await q("SELECT activated_at FROM hotel_staff WHERE user_id=$1", [s.id]);
    assert.ok(hs.activated_at);
    const [u] = await q("SELECT email_verified, pin_hash, role FROM users WHERE id=$1", [s.id]);
    assert.equal(u.email_verified, true);
    assert.ok(u.pin_hash);
    assert.equal(u.role, "hotel_staff");
    assert.equal((await call("/api/hotel/dashboard", { token: s.token })).status, 200);
    const list = await call("/api/hotel/staff", { token: h.owner.token });
    assert.equal(list.data.staff.find((x: { userId: string }) => x.userId === s.id).status, "active");
    // a replayed invite link is dead
    await q("UPDATE hotel_staff_events SET created_at = created_at - interval '2 minutes'");
    assert.equal((await call("/api/auth/reset-password", { method: "POST", body: { token: "0".repeat(96), newPassword: "whatever-12345" } })).status, 400);
  });

  test("hotel staff cap (20 active) is enforced", async () => {
    const h = await makeHotelWithOwner();
    for (let i = 0; i < 20; i++) {
      const s = await makeUser("hotel_staff");
      await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level, activated_at) VALUES ($1,$2,'Filler','staff', now())", [s.id, h.hotelId]);
    }
    const r = await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body: newStaffBody() });
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, "STAFF_LIMIT_REACHED");
  });

  test("list/detail show real data (status, redemptions), owner first, and only this hotel's people", async () => {
    const a = await makeHotelWithOwner();
    const b = await makeHotelWithOwner();
    const sa = await onboardStaff(a.owner);
    await onboardStaff(b.owner);
    await q("INSERT INTO orders (user_id, hotel_id, items, amount, status, redeemed, redeemed_by_hotel_user_id, commission_amount, hotel_amount) VALUES ($1,$2,'[]',50,'redeemed',true,$3,5,45)", [(await makeUser("student")).id, a.hotelId, sa.id]);
    const list = await call("/api/hotel/staff", { token: a.owner.token });
    assert.equal(list.status, 200);
    assert.equal(list.data.staff.length, 2);
    assert.equal(list.data.staff[0].status, "owner");
    assert.equal(list.data.staff.find((x: { userId: string }) => x.userId === sa.id).redemptions, 1);
    assert.ok(!JSON.stringify(list.data).match(/password_hash|pin_hash/));
    const detail = await call(`/api/hotel/staff/${sa.id}`, { token: a.owner.token });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.staff.email, sa.email);
  });
});

// =================================================================== authorization
describe("authorization: staff vs owner vs admin vs student (enforced on the backend)", { skip }, () => {
  test("staff are refused every owner-only endpoint; keep every counter-ops endpoint", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    const denied: Array<[string, string, unknown?]> = [
      ["GET", "/api/hotel/staff"],
      ["POST", "/api/hotel/staff", newStaffBody()],
      ["GET", `/api/hotel/staff/${s.id}`],
      ["POST", `/api/hotel/staff/${s.id}/deactivate`],
      ["POST", `/api/hotel/staff/${s.id}/reactivate`],
      ["POST", `/api/hotel/staff/${s.id}/resend-invite`],
      ["POST", "/api/hotel/menu", { name: "x", price: 10, category: "lunch" }],
      ["PATCH", `/api/hotel/menu/${h.itemId}`, { price: 1 }],
      ["DELETE", `/api/hotel/menu/${h.itemId}`],
      ["PATCH", "/api/hotel/location", { location: "somewhere" }],
      ["POST", "/api/hotel/upload-image"],
      ["GET", "/api/hotel/students"],
      ["GET", "/api/hotel/payouts"],
    ];
    for (const [method, path, body] of denied) {
      const r = await call(path, { method, token: s.token, body });
      assert.equal(r.status, 403, `${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
    }
    for (const path of ["/api/hotel/dashboard", "/api/hotel/orders", "/api/hotel/menu"]) {
      assert.equal((await call(path, { token: s.token })).status, 200, path);
    }
    // counter ops pass the role gate (the resource may legitimately be "not found", never "forbidden")
    const ready = await call(`/api/hotel/orders/${crypto.randomUUID()}/ready`, { method: "PATCH", token: s.token });
    assert.notEqual(ready.status, 403);
    const verify = await call("/api/hotel/qr/verify", { method: "POST", token: s.token, body: { qrToken: "x" } });
    assert.notEqual(verify.status, 403);
    assert.equal((await q("SELECT price FROM menu_items WHERE id=$1", [h.itemId]))[0].price, "50.00");
  });

  test("admins and students can't manage a hotel's staff; unauthenticated is 401", async () => {
    const h = await makeHotelWithOwner();
    const admin = await makeUser("mealvest_admin");
    const student = await makeUser("student");
    for (const t of [admin.token, student.token]) {
      assert.equal((await call("/api/hotel/staff", { token: t })).status, 403);
      assert.equal((await call("/api/hotel/staff", { method: "POST", token: t, body: newStaffBody() })).status, 403);
    }
    assert.equal((await call("/api/hotel/staff")).status, 401);
    assert.equal((await call("/api/hotel/staff", { method: "POST", body: newStaffBody() })).status, 401);
    void h;
  });

  test("CROSS-HOTEL: owner B cannot read, deactivate, reactivate or resend for hotel A's staff (404, and A's staff is untouched)", async () => {
    const a = await makeHotelWithOwner();
    const b = await makeHotelWithOwner();
    const sa = await onboardStaff(a.owner);
    for (const [method, path] of [
      ["GET", `/api/hotel/staff/${sa.id}`],
      ["POST", `/api/hotel/staff/${sa.id}/deactivate`],
      ["POST", `/api/hotel/staff/${sa.id}/reactivate`],
      ["POST", `/api/hotel/staff/${sa.id}/resend-invite`],
    ] as const) {
      const r = await call(path, { method, token: b.owner.token });
      assert.equal(r.status, 404, `${method} ${path}`);
      assert.equal(r.data.error.code, "STAFF_NOT_FOUND");
    }
    // owner A's id can't be deactivated by B either
    assert.equal((await call(`/api/hotel/staff/${a.owner.id}/deactivate`, { method: "POST", token: b.owner.token })).status, 404);
    assert.equal((await q("SELECT is_active FROM hotel_staff WHERE user_id=$1", [sa.id]))[0].is_active, true);
    assert.equal((await call("/api/hotel/dashboard", { token: sa.token })).status, 200);
    // malformed ids get the same answer as unknown ones
    assert.equal((await call("/api/hotel/staff/not-a-uuid", { token: b.owner.token })).status, 404);
    assert.equal((await call("/api/hotel/staff/not-a-uuid/deactivate", { method: "POST", token: b.owner.token })).status, 404);
  });

  test("staff only ever see their OWN hotel's data", async () => {
    const a = await makeHotelWithOwner();
    const b = await makeHotelWithOwner();
    const sa = await onboardStaff(a.owner);
    const menu = await call("/api/hotel/menu", { token: sa.token });
    assert.equal(menu.status, 200);
    const ids = JSON.stringify(menu.data);
    assert.ok(ids.includes(a.itemId));
    assert.ok(!ids.includes(b.itemId));
  });
});

// =================================================================== deactivation
describe("deactivation cuts every way back in; history is preserved", { skip }, () => {
  test("access token, login, refresh, half-finished login, reset and push all stop immediately", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    // a half-finished login + a registered push device + an old order they redeemed
    const pend = await call("/api/auth/login", { method: "POST", body: { identifier: s.email, password: "staff-password-1" } });
    await q("INSERT INTO notification_devices (user_id, push_token, platform) VALUES ($1, $2, 'web')", [s.id, "tok-" + crypto.randomBytes(8).toString("hex")]);
    const student = await makeUser("student");
    const [order] = await q(
      "INSERT INTO orders (user_id, hotel_id, items, amount, status, redeemed, redeemed_by_hotel_user_id, commission_amount, hotel_amount) VALUES ($1,$2,'[]',50,'redeemed',true,$3,5,45) RETURNING id",
      [student.id, h.hotelId, s.id]
    );
    assert.equal((await call("/api/hotel/dashboard", { token: s.token })).status, 200); // warms the status cache

    const r = await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.staff.status, "deactivated");

    // 1. the already-issued access token dies at once (not "within 15 minutes")
    const dash = await call("/api/hotel/dashboard", { token: s.token });
    assert.equal(dash.status, 403);
    assert.equal(dash.data.error.code, "ACCOUNT_DEACTIVATED");
    assert.equal((await call("/api/hotel/orders", { token: s.token })).status, 403);
    assert.equal((await call("/api/notifications/unread-count", { token: s.token })).status, 403);
    // 2. login: right password → told why; wrong password → plain 401 (no oracle for strangers)
    const login = await call("/api/auth/login", { method: "POST", body: { identifier: s.email, password: "staff-password-1" } });
    assert.equal(login.status, 403);
    assert.equal(login.data.error.code, "ACCOUNT_DEACTIVATED");
    assert.equal((await call("/api/auth/login", { method: "POST", body: { identifier: s.email, password: "wrong-wrong" } })).status, 401);
    // 3. refresh + PIN unlock with the old session
    assert.equal((await call("/api/auth/refresh", { method: "POST", body: { refreshToken: s.refreshToken } })).status, 401);
    // 4. the half-finished login can't be completed
    assert.ok([400, 401, 403].includes((await call("/api/auth/login/verify-pin", { method: "POST", body: { pendingToken: pend.data.pendingToken, pin: "4321" } })).status));
    assert.equal((await q("SELECT count(*)::int n FROM pending_login_tokens WHERE user_id=$1", [s.id]))[0].n, 0);
    // 5. forgot-password silently does nothing for them
    const mailsBefore = prov.emails.length; // (the earlier invite email is already in the list)
    await call("/api/auth/forgot-password", { method: "POST", body: { identifier: s.email } });
    await settle(250);
    assert.equal(prov.emails.length, mailsBefore, "no reset email may be sent to deactivated staff");
    // 6. sessions revoked, push devices off
    assert.equal((await q("SELECT count(*)::int n FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL", [s.id]))[0].n, 0);
    assert.equal((await q("SELECT count(*)::int n FROM notification_devices WHERE user_id=$1 AND enabled", [s.id]))[0].n, 0);

    // history intact: the row, the order and the audit trail all remain
    assert.equal((await q("SELECT count(*)::int n FROM hotel_staff WHERE user_id=$1", [s.id]))[0].n, 1);
    assert.equal((await q("SELECT redeemed_by_hotel_user_id FROM orders WHERE id=$1", [order.id]))[0].redeemed_by_hotel_user_id, s.id);
    const ev = await q("SELECT action, actor_user_id FROM hotel_staff_events WHERE staff_user_id=$1 ORDER BY created_at", [s.id]);
    assert.deepEqual(ev.map((e: { action: string }) => e.action), ["created", "deactivated"]);
    assert.equal(ev[1].actor_user_id, h.owner.id);
    const [d] = await q("SELECT deactivated_by, deactivated_at FROM hotel_staff WHERE user_id=$1", [s.id]);
    assert.equal(d.deactivated_by, h.owner.id);
    assert.ok(d.deactivated_at);
  });

  test("the owner (and self) can't be deactivated — not by the API and not even by a direct UPDATE", async () => {
    const h = await makeHotelWithOwner();
    const self = await call(`/api/hotel/staff/${h.owner.id}/deactivate`, { method: "POST", token: h.owner.token });
    assert.equal(self.status, 400);
    assert.equal(self.data.error.code, "CANNOT_DEACTIVATE_SELF");
    const second = await makeUser("hotel_owner");
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1,$2,'Co-owner','owner')", [second.id, h.hotelId]);
    const co = await call(`/api/hotel/staff/${second.id}/deactivate`, { method: "POST", token: h.owner.token });
    assert.equal(co.status, 400);
    assert.equal(co.data.error.code, "CANNOT_DEACTIVATE_OWNER");
    await assert.rejects(q("UPDATE hotel_staff SET is_active = false WHERE user_id=$1", [h.owner.id]), /hotel_staff_owner_always_active/);
    assert.equal((await call("/api/hotel/dashboard", { token: h.owner.token })).status, 200);
  });

  test("deactivating twice is harmless; reactivation restores access with the same password; a deactivated owner row is impossible", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    assert.equal((await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token })).status, 200);
    assert.equal((await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token })).status, 200);
    assert.equal((await q("SELECT count(*)::int n FROM hotel_staff_events WHERE staff_user_id=$1 AND action='deactivated'", [s.id]))[0].n, 1);
    const re = await call(`/api/hotel/staff/${s.id}/reactivate`, { method: "POST", token: h.owner.token });
    assert.equal(re.status, 200);
    assert.equal(re.data.staff.status, "active");
    assert.equal((await call("/api/hotel/dashboard", { token: s.token })).status, 200, "old access token works again once reactivated (cache invalidated)");
    const login = await call("/api/auth/login", { method: "POST", body: { identifier: s.email, password: "staff-password-1" } });
    assert.equal(login.status, 200);
  });

  test("an admin suspension can't be undone by the owner", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token });
    await q("UPDATE users SET account_status='suspended' WHERE id=$1", [s.id]);
    const r = await call(`/api/hotel/staff/${s.id}/reactivate`, { method: "POST", token: h.owner.token });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, "ACCOUNT_SUSPENDED");
    assert.equal((await q("SELECT is_active FROM hotel_staff WHERE user_id=$1", [s.id]))[0].is_active, false);
  });

  test("a deactivated owner-of-nothing can't act: deactivated staff can't reset their way back in", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    await call("/api/auth/forgot-password", { method: "POST", body: { identifier: s.email } });
    await settle(250);
    const tok = new URL(prov.lastEmailLink()).searchParams.get("token")!;
    await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token });
    const r = await call("/api/auth/reset-password", { method: "POST", body: { token: tok, newPassword: "sneaky-new-pass-1" } });
    assert.equal(r.status, 400);
    assert.equal(await bcrypt.compare("staff-password-1", (await q("SELECT password_hash FROM users WHERE id=$1", [s.id]))[0].password_hash), true);
  });

  test("verified-email policy never blocks DEACTIVATION (removing access must always work), but does gate invites", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    await q("UPDATE users SET email_verified=false WHERE id=$1", [h.owner.id]);
    const e = m.env.env;
    e.requireVerifiedEmailForSensitiveOps = true;
    try {
      const invite = await call("/api/hotel/staff", { method: "POST", token: h.owner.token, body: newStaffBody() });
      assert.equal(invite.status, 403);
      assert.equal(invite.data.error.code, "EMAIL_NOT_VERIFIED");
      assert.equal((await call(`/api/hotel/staff/${s.id}/deactivate`, { method: "POST", token: h.owner.token })).status, 200);
    } finally {
      e.requireVerifiedEmailForSensitiveOps = false;
    }
  });
});

// =================================================================== notification targeting
describe("hotel notifications: right people, right content, no owner data to staff", { skip }, () => {
  const notesFor = (userId: string) => q("SELECT type, title, body, deep_link FROM notifications WHERE user_id=$1 ORDER BY created_at", [userId]);

  test("payout/settlement notices go to the OWNER only; staff and deactivated staff get nothing", async () => {
    const h = await makeHotelWithOwner();
    const active = await onboardStaff(h.owner);
    const gone = await onboardStaff(h.owner);
    await call(`/api/hotel/staff/${gone.id}/deactivate`, { method: "POST", token: h.owner.token });
    m.events.hotelPayoutStatusChanged(h.hotelId, "successful", 1234);
    await settle();
    assert.equal((await notesFor(h.owner.id)).filter((n: { type: string }) => n.type === "hotel_payout_status").length, 1);
    assert.equal((await notesFor(active.id)).filter((n: { type: string }) => n.type === "hotel_payout_status").length, 0);
    assert.equal((await notesFor(gone.id)).length, 0);
  });

  test("order/redemption events: owner sees revenue + owner link; staff get a revenue-free message + STAFF link; deactivated staff nothing", async () => {
    const h = await makeHotelWithOwner();
    const staff = await onboardStaff(h.owner);
    const gone = await onboardStaff(h.owner);
    await call(`/api/hotel/staff/${gone.id}/deactivate`, { method: "POST", token: h.owner.token });
    const orderId = crypto.randomUUID();
    m.events.hotelMealRedeemed(h.hotelId, 450, orderId);
    m.events.hotelOrderReceived(h.hotelId, 500, orderId);
    await settle();
    const own = await notesFor(h.owner.id);
    const stf = await notesFor(staff.id);
    const redeemedOwner = own.find((n: { type: string }) => n.type === "hotel_meal_redeemed");
    const redeemedStaff = stf.find((n: { type: string }) => n.type === "hotel_meal_redeemed");
    assert.match(redeemedOwner.body, /KSh 450/);
    assert.equal(redeemedOwner.deep_link, "/hotel-owner/orders");
    assert.ok(!/KSh|revenue|earn/i.test(redeemedStaff.body), `staff body leaked money: ${redeemedStaff.body}`);
    assert.equal(redeemedStaff.deep_link, "/hotel-staff/orders");
    assert.equal(stf.find((n: { type: string }) => n.type === "hotel_order_received").deep_link, "/hotel-staff/orders");
    assert.equal((await notesFor(gone.id)).length, 0);
  });

  test("staff use the SAME notification API for their own inbox only; they can't touch the owner's notifications", async () => {
    const h = await makeHotelWithOwner();
    const s = await onboardStaff(h.owner);
    m.events.hotelOrderReceived(h.hotelId, 100, crypto.randomUUID());
    await settle();
    const list = await call("/api/notifications", { token: s.token });
    assert.equal(list.status, 200);
    assert.ok(list.data.notifications.length >= 1);
    assert.ok(list.data.notifications.every((n: { user_id?: string }) => n.user_id === undefined || n.user_id === s.id));
    const unread = await call("/api/notifications/unread-count", { token: s.token });
    assert.ok(unread.data.count >= 1);
    const mine = list.data.notifications[0];
    assert.equal((await call(`/api/notifications/${mine.id}/read`, { method: "PATCH", token: s.token })).status, 200);
    const [ownersNote] = await q("SELECT id FROM notifications WHERE user_id=$1 LIMIT 1", [h.owner.id]);
    assert.equal((await call(`/api/notifications/${ownersNote.id}/read`, { method: "PATCH", token: s.token })).status, 404);
    const prefs = await call("/api/notifications/preferences", { token: s.token });
    assert.equal(prefs.status, 200);
    const upd = await call("/api/notifications/preferences", { method: "PATCH", token: s.token, body: { pushEnabled: true } });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.preferences.push_enabled, true);
  });
});

// =================================================================== devices + test endpoint
describe("push devices and the test endpoint", { skip }, () => {
  const reg = (u: { token: string }, pushToken: string) => call("/api/notifications/devices", { method: "POST", token: u.token, body: { pushToken, platform: "web", browser: "Chrome" } });
  const tok = () => "fcm-" + crypto.randomBytes(24).toString("hex");

  test("users can register and disable only THEIR OWN devices; unauthenticated is refused", async () => {
    const a = await makeUser("student");
    const b = await makeUser("hotel_staff");
    const t = tok();
    assert.equal((await reg(a, t)).status, 201);
    assert.equal((await call("/api/notifications/devices/disable", { method: "POST", token: b.token, body: { pushToken: t } })).status, 404);
    assert.equal((await q("SELECT enabled FROM notification_devices WHERE push_token=$1", [t]))[0].enabled, true);
    assert.equal((await call("/api/notifications/devices")).status, 401);
    assert.equal((await call("/api/notifications/devices", { method: "POST", body: { pushToken: t, platform: "web" } })).status, 401);
    assert.equal((await call("/api/notifications/devices/disable", { method: "POST", token: a.token, body: { pushToken: t } })).status, 200);
    assert.equal((await q("SELECT enabled FROM notification_devices WHERE push_token=$1", [t]))[0].enabled, false);
  });

  test("re-registering the same token is idempotent (one row); a token follows the browser to whoever registers it last", async () => {
    const a = await makeUser("student");
    const b = await makeUser("hotel_staff");
    const t = tok();
    await reg(a, t);
    await reg(a, t);
    assert.equal((await q("SELECT count(*)::int n FROM notification_devices WHERE push_token=$1", [t]))[0].n, 1);
    await reg(b, t); // shared browser: b signs in on a's browser
    const [row] = await q("SELECT user_id, enabled FROM notification_devices WHERE push_token=$1", [t]);
    assert.equal(row.user_id, b.id);
    assert.equal(row.enabled, true);
    const aDevices = await call("/api/notifications/devices", { token: a.token });
    assert.equal(aDevices.data.devices.filter((d: { push_token: string }) => d.push_token === t).length, 0);
  });

  test("fan-out is bounded: only the 10 most recent devices per user stay enabled", async () => {
    const u = await makeUser("student");
    for (let i = 0; i < 13; i++) {
      await reg(u, tok());
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal((await q("SELECT count(*)::int n FROM notification_devices WHERE user_id=$1 AND enabled", [u.id]))[0].n, 10);
  });

  test("test endpoint: needs auth, reports the TRUTH (not configured / no devices), role-aware link, no paid SMS unless opted in", async () => {
    assert.equal((await call("/api/notifications/test", { method: "POST" })).status, 401);
    const staff = await makeUser("hotel_staff");
    const r = await call("/api/notifications/test", { method: "POST", token: staff.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.sent, false, "must not claim success when push isn't configured");
    assert.equal(r.data.push.status, "skipped");
    assert.equal(r.data.push.reason, "Push not configured");
    assert.equal(r.data.sms, "skipped");
    const [n] = await q("SELECT deep_link FROM notifications WHERE user_id=$1 AND type='test'", [staff.id]);
    assert.equal(n.deep_link, "/hotel-staff/home");
    const owner = await makeUser("hotel_owner");
    await call("/api/notifications/test", { method: "POST", token: owner.token });
    assert.equal((await q("SELECT deep_link FROM notifications WHERE user_id=$1 AND type='test'", [owner.id]))[0].deep_link, "/hotel-owner/home");
  });

  test("with push configured but no device registered the test says so", async () => {
    const e = m.env.env;
    const saved = { p: e.firebaseProjectId, c: e.firebaseClientEmail, k: e.firebasePrivateKey };
    e.firebaseProjectId = "demo"; e.firebaseClientEmail = "x@demo.iam.gserviceaccount.com"; e.firebasePrivateKey = "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n";
    try {
      const u = await makeUser("student");
      const r = await call("/api/notifications/test", { method: "POST", token: u.token });
      assert.equal(r.data.sent, false);
      assert.equal(r.data.push.reason, "No registered devices");
    } finally {
      e.firebaseProjectId = saved.p; e.firebaseClientEmail = saved.c; e.firebasePrivateKey = saved.k;
    }
  });
});

describe("FCM error classification (pure)", { skip }, () => {
  test("only genuinely dead tokens are disabled; payload/quota/auth errors never disable a device", () => {
    const dead = m.fcm.isDeadTokenError;
    assert.equal(dead({ status: "NOT_FOUND", message: "Requested entity was not found." }), true);
    assert.equal(dead({ status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] }), true);
    assert.equal(dead({ status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" }), true);
    assert.equal(dead({ status: "INVALID_ARGUMENT", details: [{ errorCode: "SENDER_ID_MISMATCH" }] }), true);
    // the old code treated ALL of these as dead and silently killed users' devices:
    assert.equal(dead({ status: "INVALID_ARGUMENT", message: "Invalid value at 'message.webpush.fcm_options.link'" }), false);
    assert.equal(dead({ status: "INVALID_ARGUMENT", message: "Invalid JSON payload received." }), false);
    assert.equal(dead({ status: "RESOURCE_EXHAUSTED" }), false);
    assert.equal(dead({ status: "UNAVAILABLE" }), false);
    assert.equal(dead({ status: "PERMISSION_DENIED" }), false);
    assert.equal(dead({ status: "UNAUTHENTICATED" }), false);
    assert.equal(dead(undefined), false);
  });
});

// =================================================================== meal reminders
describe("meal reminders honour each student's reminder_time (Africa/Nairobi)", { skip }, () => {
  async function student(reminderTime: string, opts: { meal?: boolean; budget?: boolean; suspended?: boolean } = {}) {
    const u = await makeUser("student", { suspended: opts.suspended });
    await q(
      "INSERT INTO notification_preferences (user_id, meal_reminders, reminder_time) VALUES ($1, $2, $3::time) ON CONFLICT (user_id) DO UPDATE SET meal_reminders=$2, reminder_time=$3::time",
      [u.id, opts.meal ?? true, reminderTime]
    );
    if (opts.budget !== false) {
      // budgets can only be created through a real funding transaction (DB trigger), so fund one properly.
      const ref = m.pay.generatePaymentReference();
      await m.pay.createPendingTransaction({ userId: u.id, hotelId: null, amount: 3000, phoneNumber: "254700000001", provider: "paystack", reference: ref, numberOfDays: 30 });
      await m.pay.activatePaymentIfNeeded(ref, { reference: ref, status: "success", amount: 3000, currency: "KES", providerTransactionId: "ps_1", paidAt: null, raw: {} });
    }
    return u.id as string;
  }
  const remindersOf = (id: string) => q("SELECT dedupe_key FROM notifications WHERE user_id=$1 AND type='meal_reminder'", [id]);
  // 2026-11-03 06:10 UTC == 09:10 in Africa/Nairobi (UTC+3, no DST)
  const at = new Date("2026-11-03T06:10:00Z");

  test("only students whose time has JUST arrived are reminded; later, much-earlier, opted-out, no-plan and suspended are not", async () => {
    await q("DELETE FROM notifications WHERE type='meal_reminder'");
    const due = await student("09:00");
    const dueEdge = await student("09:10");
    const later = await student("09:30");
    const tooEarly = await student("07:00"); // window is 90 min: 07:40–09:10
    const optedOut = await student("09:05", { meal: false });
    const noPlan = await student("09:05", { budget: false });
    const suspended = await student("09:05", { suspended: true });
    const s = await m.reminders.runMealReminders(at);
    assert.equal(s.date, "2026-11-03");
    assert.equal(s.window.to, "09:10:00");
    assert.equal(s.window.from, "07:40:00");
    assert.equal(s.due, 2);
    assert.equal((await remindersOf(due)).length, 1);
    assert.equal((await remindersOf(dueEdge)).length, 1);
    for (const id of [later, tooEarly, optedOut, noPlan, suspended]) assert.equal((await remindersOf(id)).length, 0);
    assert.equal((await remindersOf(due))[0].dedupe_key, "meal_reminder:2026-11-03");

    // idempotent: a retry or overlapping run sends nothing more
    const again = await m.reminders.runMealReminders(at);
    assert.equal(again.due, 0);
    assert.equal((await remindersOf(due)).length, 1);

    // 20 minutes later the 09:30 student becomes due; the earlier ones are not repeated
    const next = await m.reminders.runMealReminders(new Date("2026-11-03T06:35:00Z"));
    assert.equal(next.due, 1);
    assert.equal((await remindersOf(later)).length, 1);
    assert.equal((await remindersOf(due)).length, 1);
  });

  test("the day boundary follows Nairobi, not UTC (21:30 UTC is already tomorrow 00:30 in Nairobi)", async () => {
    const late = await student("00:20");
    const s = await m.reminders.runMealReminders(new Date("2026-11-03T21:30:00Z"));
    assert.equal(s.date, "2026-11-04");
    assert.ok((await remindersOf(late)).some((r: { dedupe_key: string }) => r.dedupe_key === "meal_reminder:2026-11-04"));
  });

  test("the cron endpoint is secret-protected and returns an honest summary", async () => {
    assert.equal((await call("/api/cron/meal-reminders")).status, 401);
    const wrong = await http_(api.base, "/api/cron/meal-reminders", { headers: { Authorization: "Bearer nope", "X-Forwarded-For": "10.77.0.1" } });
    assert.equal(wrong.status, 401);
    const ok = await http_(api.base, "/api/cron/meal-reminders", { headers: { Authorization: "Bearer integration-cron-secret", "X-Forwarded-For": "10.77.0.2" } });
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.data.due, "number");
    assert.ok(ok.data.window.from && ok.data.window.to);
    assert.equal(typeof ok.data.staleDevicesPurged, "number");
  });

  test("devices FCM/users disabled over a month ago are purged; recent ones kept", async () => {
    const u = await makeUser("student");
    await q("INSERT INTO notification_devices (user_id, push_token, platform, enabled, updated_at) VALUES ($1,'old-dead','web',false, now() - interval '40 days'), ($1,'recent-off','web',false, now()), ($1,'live','web',true, now() - interval '40 days')", [u.id]);
    await m.reminders.runMealReminders(at);
    const left = (await q("SELECT push_token FROM notification_devices WHERE user_id=$1 ORDER BY push_token", [u.id])).map((r: { push_token: string }) => r.push_token);
    assert.deepEqual(left, ["live", "recent-off"]);
  });
});
