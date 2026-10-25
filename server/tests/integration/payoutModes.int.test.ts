/**
 * Hotel payout modes (instant | daily), hotel-specific commission and the
 * Daily Payout scheduler. REAL Postgres (TEST_DATABASE_URL, localhost
 * only) + the in-process mock Paystack. No real provider is called, no
 * money moves, no production credentials are used.
 *   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/mealvest_test npm run test:integration
 */
import { describe, test, before, after, beforeEach } from "node:test";
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

// 2026-10-24 21:00 in Africa/Nairobi (UTC+3, no DST)
const NAIROBI_2100 = new Date("2026-10-24T18:00:00Z");
const NEXT_DAY_2100 = new Date("2026-10-25T18:00:00Z");

before(async () => {
  if (!enabled) return;
  await mock.start();
  configureEnv(mock.port);
  process.env.AUTO_PAYOUTS_ENABLED = "true";
  process.env.AUTO_PAYOUT_THRESHOLD_KES = "40";
  await resetDatabase();
  m.db = await import("../../src/config/db");
  m.env = await import("../../src/config/env");
  m.order = await import("../../src/services/orderService");
  m.payout = await import("../../src/services/hotelPayoutService");
  m.daily = await import("../../src/services/dailyPayoutService");
  m.model = await import("../../src/models/hotelPayoutModel");
  m.jwt = await import("../../src/lib/jwt");
  m.qr = await import("../../src/lib/qr");
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

// ---------------------------------------------------------------- helpers
async function q(sql: string, params: unknown[] = []) {
  return (await m.db.pool.query(sql, params)).rows;
}
let seq = 0;
async function makeUser(role: "student" | "mealvest_admin" | "hotel_owner" = "student") {
  seq++;
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, 'password', false, 'active') RETURNING id`,
    [`pm${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2547${String(seq + 7000).padStart(8, "0")}`, await bcrypt.hash("password123", 4), await bcrypt.hash("1234", 4), role]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `Student ${seq}`]);
  return { id: u.id as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
/** payout columns are left to the migration defaults unless given: this is exactly an "existing hotel" row. */
async function makeHotel(opts: { mode?: "instant" | "daily"; time?: string | null; override?: number | null; noSettlement?: boolean } = {}) {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, payout_mode, payout_time, commission_override_percent)
     VALUES ($1, 'active', $2, $3, COALESCE($4, 'instant'), $5::time, $6) RETURNING id`,
    [
      `PM Hotel ${seq}`,
      opts.noSettlement ? null : "send_money",
      opts.noSettlement ? null : JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" }),
      opts.mode ?? null,
      opts.time ?? null,
      opts.override ?? null,
    ]
  );
  return h.id as string;
}
async function earn(userId: string, hotelId: string, hotelAmounts: number[]) {
  for (const a of hotelAmounts) {
    await q(
      `INSERT INTO orders (user_id, hotel_id, items, amount, status, redeemed, commission_amount, hotel_amount)
       VALUES ($1, $2, '[]', $3, 'redeemed', true, 0, $3)`,
      [userId, hotelId, a]
    );
  }
}
async function unpaid(hotelId: string): Promise<number> {
  return Number((await q("SELECT COALESCE(SUM(hotel_amount),0) s FROM orders WHERE hotel_id=$1 AND redeemed AND payout_id IS NULL", [hotelId]))[0].s);
}
const payoutsOf = (hotelId: string) => q("SELECT * FROM hotel_payouts WHERE hotel_id=$1 ORDER BY created_at", [hotelId]);
async function paidOrder(userId: string, hotelId: string, amount: number) {
  const [o] = await q("INSERT INTO orders (user_id, hotel_id, items, amount, status) VALUES ($1,$2,'[]',$3,'paid') RETURNING id", [userId, hotelId, amount]);
  return o.id as string;
}
async function redeem(hotelId: string, amount: number) {
  const s = await makeUser();
  const staff = await makeUser("hotel_owner");
  const orderId = await paidOrder(s.id, hotelId, amount);
  await m.order.redeemOrderByQr(m.qr.generateOrderQrPayload(orderId), hotelId, staff.id);
  const [o] = await q("SELECT commission_amount, hotel_amount FROM orders WHERE id=$1", [orderId]);
  return { orderId, commission: Number(o.commission_amount), hotelAmount: Number(o.hotel_amount) };
}
const settle = () => new Promise((r) => setTimeout(r, 500)); // let the background auto-payout task finish

// ============================================================ configuration
describe("payout-mode configuration", { skip }, () => {
  const base = () => ({
    email: `reg${++seq}-${crypto.randomBytes(3).toString("hex")}@int.test`,
    phoneNumber: `2547${String(seq + 9000).padStart(8, "0")}`,
    password: "Password123!",
    pin: "1234",
    hotelName: `Reg Hotel ${seq}`,
    businessType: "hotel",
    contactFullName: "Owner Name",
    settlement: { method: "send_money", phoneNumber: "0712345678", accountHolderName: "Owner Name" },
  });
  const hotelByEmail = async (email: string) => (await q("SELECT * FROM hotels WHERE contact_email = $1", [email.toLowerCase()]))[0];

  test("a new hotel can register with Instant Payout (no time needed)", async () => {
    const body = { ...base(), payout: { mode: "instant" } };
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const h = await hotelByEmail(body.email);
    assert.equal(h.payout_mode, "instant");
    assert.equal(h.payout_time, null);
    assert.equal(h.commission_override_percent, null);
  });

  test("a new hotel can register with Daily Payout and a time", async () => {
    const body = { ...base(), payout: { mode: "daily", payoutTime: "21:00" } };
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const h = await hotelByEmail(body.email);
    assert.equal(h.payout_mode, "daily");
    assert.equal(String(h.payout_time).slice(0, 5), "21:00");
    assert.equal(h.commission_override_percent, null);
  });

  test("Daily without a valid time, an invalid mode, and a smuggled commission are all rejected (nothing created)", async () => {
    for (const payout of [{ mode: "daily" }, { mode: "daily", payoutTime: "25:00" }, { mode: "weekly", payoutTime: "09:00" }, { mode: "instant", commissionPercent: 0 }]) {
      const body = { ...base(), payout };
      const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
      assert.equal(r.status, 400, JSON.stringify(payout));
      assert.equal(await hotelByEmail(body.email), undefined);
    }
    const top = { ...base(), commissionPercent: 0, payout: { mode: "instant" } };
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body: top });
    const h = await hotelByEmail(top.email);
    // zod strips unknown top-level keys: whatever happened, no commission was stored
    assert.equal(h?.commission_override_percent ?? null, null);
    assert.ok(r.status === 201 || r.status === 400);
  });

  test("older clients that send no payout block register as Instant", async () => {
    const body = base();
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await hotelByEmail(body.email)).payout_mode, "instant");
  });

  test("existing hotels (rows without the new columns set) are Instant with no time and no override", async () => {
    const id = await makeHotel();
    const [h] = await q("SELECT payout_mode, payout_time, commission_override_percent FROM hotels WHERE id=$1", [id]);
    assert.deepEqual({ ...h }, { payout_mode: "instant", payout_time: null, commission_override_percent: null });
  });

  test("the database itself refuses daily-without-time and out-of-range overrides", async () => {
    const id = await makeHotel();
    await assert.rejects(q("UPDATE hotels SET payout_mode='daily', payout_time=NULL WHERE id=$1", [id]));
    await assert.rejects(q("UPDATE hotels SET commission_override_percent=31 WHERE id=$1", [id]));
    await assert.rejects(q("UPDATE hotels SET commission_override_percent=-1 WHERE id=$1", [id]));
  });
});

// ============================================================ commission
describe("hotel-specific commission", { skip }, () => {
  test("instant defaults to 15%, daily to 10% (applied once, frozen on the order)", async () => {
    mock.reset();
    const a = await makeHotel({ mode: "instant" });
    const b = await makeHotel({ mode: "daily", time: "21:00" });
    const ra = await redeem(a, 100);
    const rb = await redeem(b, 100);
    assert.deepEqual([ra.commission, ra.hotelAmount], [15, 85]);
    assert.deepEqual([rb.commission, rb.hotelAmount], [10, 90]);
    await settle();
  });

  test("an admin override affects only that hotel and only FUTURE orders; history is untouched", async () => {
    mock.reset();
    const admin = await makeUser("mealvest_admin");
    const a = await makeHotel({ mode: "instant" });
    const b = await makeHotel({ mode: "daily", time: "21:00" });
    const before = await redeem(a, 100); // 15%
    const r = await http_(api.base, `/api/admin/hotels/${a}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: 12 } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(Number(r.data.hotel.commission_percent), 12);
    assert.equal(r.data.hotel.commission_is_override, true);
    const afterA = await redeem(a, 100);
    const afterB = await redeem(b, 100);
    assert.deepEqual([afterA.commission, afterA.hotelAmount], [12, 88]);
    assert.deepEqual([afterB.commission, afterB.hotelAmount], [10, 90]); // hotel B untouched
    const [old] = await q("SELECT commission_amount, hotel_amount FROM orders WHERE id=$1", [before.orderId]);
    assert.deepEqual([Number(old.commission_amount), Number(old.hotel_amount)], [15, 85]); // not rewritten
    await settle();
  });

  test("changing payout mode does not erase an explicit override; clearing it (null) restores the mode default", async () => {
    const admin = await makeUser("mealvest_admin");
    const h = await makeHotel({ mode: "instant", override: 12 });
    let r = await http_(api.base, `/api/admin/hotels/${h}/payout-settings`, { method: "PATCH", token: admin.token, body: { mode: "daily", payoutTime: "20:30" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.hotel.payout_mode, "daily");
    assert.equal(r.data.hotel.payout_time, "20:30");
    assert.equal(Number(r.data.hotel.commission_override_percent), 12);
    assert.equal(Number(r.data.hotel.commission_percent), 12);
    r = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: null } });
    assert.equal(r.data.hotel.commission_is_override, false);
    assert.equal(Number(r.data.hotel.commission_percent), 10); // daily default
    // an override of 0% is a real override, not "absent"
    r = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: 0 } });
    assert.equal(r.data.hotel.commission_is_override, true);
    assert.equal(Number(r.data.hotel.commission_percent), 0);
  });

  test("backend validates the rate; non-admins cannot change it; a hotel cannot set its own", async () => {
    const admin = await makeUser("mealvest_admin");
    const owner = await makeUser("hotel_owner");
    const student = await makeUser("student");
    const h = await makeHotel();
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1,$2,'Owner','owner')", [owner.id, h]);
    for (const bad of [-1, 30.01, 31, "12", 12.345]) {
      const r = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: bad } });
      assert.equal(r.status, 400, String(bad));
    }
    const ok = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: 30 } });
    assert.equal(ok.status, 200);
    for (const who of [owner, student]) {
      const r = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: who.token, body: { commissionPercent: 1 } });
      assert.equal(r.status, 403);
      const r2 = await http_(api.base, `/api/admin/hotels/${h}/payout-settings`, { method: "PATCH", token: who.token, body: { mode: "instant" } });
      assert.equal(r2.status, 403);
    }
    const none = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", body: { commissionPercent: 1 } });
    assert.equal(none.status, 401);
    const [row] = await q("SELECT commission_override_percent FROM hotels WHERE id=$1", [h]);
    assert.equal(Number(row.commission_override_percent), 30);
    // the hotel's own profile endpoint cannot carry a commission
    const own = await http_(api.base, "/api/hotel/location", { method: "PATCH", token: owner.token, body: { commissionPercent: 0, commission_override_percent: 0, description: "x" } });
    assert.ok([200, 400].includes(own.status));
    const [row2] = await q("SELECT commission_override_percent FROM hotels WHERE id=$1", [h]);
    assert.equal(Number(row2.commission_override_percent), 30);
  });

  test("admin lists and detail expose mode, time, effective rate and whether it is an override; hotels never see the rate", async () => {
    const admin = await makeUser("mealvest_admin");
    const owner = await makeUser("hotel_owner");
    const h = await makeHotel({ mode: "daily", time: "21:00", override: 12 });
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1,$2,'Owner','owner')", [owner.id, h]);
    const list = await http_(api.base, "/api/admin/hotels", { token: admin.token });
    const row = list.data.hotels.find((x: any) => x.id === h);
    assert.equal(row.payout_mode, "daily");
    assert.equal(row.payout_time, "21:00");
    assert.equal(Number(row.commission_percent), 12);
    assert.equal(row.commission_is_override, true);
    const detail = await http_(api.base, `/api/admin/hotels/${h}`, { token: admin.token });
    assert.equal(detail.data.hotel.payout_mode, "daily");
    const dash = await http_(api.base, "/api/hotel/dashboard", { token: owner.token });
    assert.equal(dash.data.hotel.payout_mode, "daily");
    assert.equal(dash.data.hotel.payout_time, "21:00");
    assert.equal("commission_percent" in dash.data.hotel, false);
    const pay = await http_(api.base, "/api/hotel/payouts", { token: owner.token });
    assert.equal(pay.data.summary.payout_mode, "daily");
    assert.equal(pay.data.summary.payout_time, "21:00");
    assert.equal(JSON.stringify(pay.data).includes("commission"), false);
  });
});

// ============================================================ instant
describe("Instant Payout (existing behaviour preserved)", { skip }, () => {
  test("below 40 accumulates; 25 + 20 pays the whole 45; exactly 40 pays", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "instant" });
    await earn(s.id, h, [25]);
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "below_threshold");
    await earn(s.id, h, [20]);
    const r = await m.payout.evaluateAutoPayout(h);
    assert.equal(r.action, "initiated");
    assert.equal(Number(r.payout.amount), 45);
    assert.equal(await unpaid(h), 0);
    const e = await makeHotel({ mode: "instant" });
    await earn(s.id, e, [40]);
    assert.equal(Number((await m.payout.evaluateAutoPayout(e)).payout.amount), 40);
  });

  test("a QR redemption still triggers the payout in the background for an instant hotel", async () => {
    mock.reset();
    const h = await makeHotel({ mode: "instant" });
    const r = await redeem(h, 100); // 85 net
    assert.equal(r.hotelAmount, 85);
    await settle();
    const ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(Number(ps[0].amount), 85);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });
});

// ============================================================ daily
describe("Daily Payout", { skip }, () => {
  // Hotels left over from earlier tests would also come due at 21:00 and
  // consume the mock's one-shot failure behaviours. Park every existing
  // hotel at 23:59 (daily): none of this suite's runs go past 23:30.
  beforeEach(async () => {
    await q("UPDATE hotels SET payout_mode = 'daily', payout_time = '23:59'");
  });

  test("earnings accumulate with NO per-order payout, even far above KSh 40, and the sweep ignores the hotel", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await redeem(h, 100); // 90 net, well over 40
    await settle();
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(mock.count("POST", "/transfer"), 0);
    await earn(s.id, h, [40]);
    const r = await m.payout.evaluateAutoPayout(h);
    assert.deepEqual({ action: r.action, reason: r.reason }, { action: "skipped", reason: "daily_mode" });
    await m.payout.sweepAutoPayouts(50);
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 130);
  });

  test("at the configured time ONE payout carries the whole accumulated balance (20+30+40+25 = 115)", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [20, 30, 40, 25]);
    const early = await m.daily.runDailyPayouts({ now: new Date("2026-10-24T17:59:00Z") }); // 20:59
    assert.equal((await payoutsOf(h)).length, 0);
    assert.ok(early.localTime === "20:59");
    const run = await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.ok(run.initiated >= 1);
    const ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(Number(ps[0].amount), 115);
    assert.equal(ps[0].initiated_by_admin_id, null);
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [ps[0].id]))[0].n, 4);
    assert.equal(await unpaid(h), 0);
    assert.equal(mock.count("POST", "/transfer"), 1);
    const [rr] = await q("SELECT status, payout_id FROM hotel_daily_payout_runs WHERE hotel_id=$1", [h]);
    assert.deepEqual({ status: rr.status, payout_id: rr.payout_id }, { status: "initiated", payout_id: ps[0].id });
  });

  test("running the job again, or two schedulers at once, never creates a second payout", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [100]);
    await Promise.all([m.daily.runDailyPayouts({ now: NAIROBI_2100 }), m.daily.runDailyPayouts({ now: NAIROBI_2100 }), m.daily.runDailyPayouts({ now: NAIROBI_2100 })]);
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
    assert.equal((await q("SELECT count(*)::int n FROM hotel_daily_payout_runs WHERE hotel_id=$1", [h]))[0].n, 1);
  });

  test("below KSh 40 at the scheduled time carries forward and the hotel stays Daily; paid at the NEXT evaluation once >= 40", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [35]);
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 35);
    const [r1] = await q("SELECT status FROM hotel_daily_payout_runs WHERE hotel_id=$1", [h]);
    assert.equal(r1.status, "below_threshold");
    await earn(s.id, h, [10]); // 45 now, later the same evening
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "skipped"); // not instant
    await m.daily.runDailyPayouts({ now: new Date("2026-10-24T19:00:00Z") }); // still same Nairobi day
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal((await q("SELECT payout_mode FROM hotels WHERE id=$1", [h]))[0].payout_mode, "daily");
    await m.daily.runDailyPayouts({ now: NEXT_DAY_2100 });
    const ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(Number(ps[0].amount), 45);
  });

  test("hotels with different times are evaluated independently", async () => {
    mock.reset();
    const s = await makeUser();
    const early = await makeHotel({ mode: "daily", time: "09:00" });
    const late = await makeHotel({ mode: "daily", time: "23:30" });
    await earn(s.id, early, [60]); await earn(s.id, late, [70]);
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.equal((await payoutsOf(early)).length, 1);
    assert.equal((await payoutsOf(late)).length, 0);
    await m.daily.runDailyPayouts({ now: new Date("2026-10-24T20:30:00Z") }); // 23:30
    assert.equal((await payoutsOf(late)).length, 1);
    assert.equal((await payoutsOf(early)).length, 1);
  });

  test("an order completed after the reservation is NOT swept into that payout", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [100]);
    const claimed = await m.model.claimPendingOrdersForPayout(h, "PO-test-reserve-" + crypto.randomBytes(3).toString("hex"), null, "paystack", { perPayoutMaxKes: 5000, dailyMaxKes: 1e6 }, 40, "daily");
    assert.equal(Number(claimed.amount), 100);
    await earn(s.id, h, [20]); // arrives while the payout is being processed
    assert.equal(Number(claimed.amount), 100);
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [claimed.id]))[0].n, 1);
    assert.equal(await unpaid(h), 20);
  });

  test("an instant trigger cannot reserve a daily hotel's earnings, even when called directly (mode re-checked under the row lock)", async () => {
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [100]);
    const r = await m.model.claimPendingOrdersForPayout(h, "PO-test-x-" + crypto.randomBytes(3).toString("hex"), null, "paystack", { perPayoutMaxKes: 5000, dailyMaxKes: 1e6 }, 40, "instant");
    assert.equal(r, null);
    assert.equal(await unpaid(h), 100);
  });

  test("a failed scheduled payout preserves the entitlement, is recorded, and does NOT fall back to instant payout", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [80]);
    mock.nextTransfer = "400"; // definite provider rejection
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    const ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(ps[0].status, "failed");
    assert.equal(await unpaid(h), 80); // released back to unpaid, not lost
    assert.equal((await m.payout.evaluateAutoPayout(h)).reason, "daily_mode");
    await m.payout.sweepAutoPayouts(50);
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
    // the next scheduled evaluation honours the existing failure cooldown instead of retrying blindly
    await m.daily.runDailyPayouts({ now: NEXT_DAY_2100 });
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("an uncertain (unknown) outcome is never re-sent by the scheduler — it waits for reconciliation", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [80]);
    mock.nextTransfer = "drop"; // provider created it, response lost
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    let ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(ps[0].status, "unknown");
    await earn(s.id, h, [60]);
    await m.daily.runDailyPayouts({ now: NEXT_DAY_2100 });
    ps = await payoutsOf(h);
    assert.equal(ps.length, 1); // no second payout while the first is unresolved
    assert.equal(mock.count("POST", "/transfer"), 1);
    assert.equal(await unpaid(h), 60); // the later earnings are untouched
  });

  test("one hotel's problem does not stop other hotels", async () => {
    mock.reset();
    const s = await makeUser();
    const broken = await makeHotel({ mode: "daily", time: "08:00", noSettlement: true });
    const good = await makeHotel({ mode: "daily", time: "09:00" });
    await earn(s.id, broken, [90]); await earn(s.id, good, [90]);
    const run = await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.equal((await payoutsOf(good)).length, 1);
    assert.equal((await payoutsOf(broken)).length, 0);
    assert.equal(await unpaid(broken), 90);
    assert.ok(run.skipped + run.errors >= 1);
  });

  test("switching Daily -> Instant keeps every unpaid shilling and pays it once under the new mode", async () => {
    mock.reset();
    const admin = await makeUser("mealvest_admin");
    const s = await makeUser(); const h = await makeHotel({ mode: "daily", time: "21:00" });
    await earn(s.id, h, [100]);
    const r = await http_(api.base, `/api/admin/hotels/${h}/payout-settings`, { method: "PATCH", token: admin.token, body: { mode: "instant" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.hotel.payout_time, null);
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 100);
    const out = await m.payout.evaluateAutoPayout(h);
    assert.equal(Number(out.payout.amount), 100);
  });

  test("the cron endpoint is secret-protected and returns the run summary", async () => {
    const none = await http_(api.base, "/api/cron/daily-payouts");
    assert.equal(none.status, 401);
    const wrong = await http_(api.base, "/api/cron/daily-payouts", { headers: { authorization: "Bearer nope" } });
    assert.equal(wrong.status, 401);
    const ok = await http_(api.base, "/api/cron/daily-payouts", { headers: { authorization: "Bearer integration-cron-secret" } });
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.data.localDate, "string");
    assert.equal(ok.data.enabled, true);
  });
});
