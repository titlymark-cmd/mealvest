/**
 * Daily-only hotel payouts, the fixed 10% payout fee, and the payout
 * scheduler. REAL Postgres (TEST_DATABASE_URL, localhost
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
async function makeHotel(opts: { time?: string; noSettlement?: boolean } = {}) {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, payout_mode, payout_time)
     VALUES ($1, 'active', $2, $3, 'daily', $4::time) RETURNING id`,
    [
      `PM Hotel ${seq}`,
      opts.noSettlement ? null : "send_money",
      opts.noSettlement ? null : JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" }),
      opts.time ?? "21:00",
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

  test("a new hotel registers for a daily payout at its configured time", async () => {
    const body = { ...base(), payout: { mode: "daily", payoutTime: "21:00" } };
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const h = await hotelByEmail(body.email);
    assert.equal(h.payout_mode, "daily");
    assert.equal(String(h.payout_time).slice(0, 5), "21:00");
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

  test("instant mode, invalid times, and a smuggled fee are rejected", async () => {
    for (const payout of [{ mode: "daily" }, { mode: "daily", payoutTime: "25:00" }, { mode: "weekly", payoutTime: "09:00" }, { mode: "instant", payoutTime: "09:00" }]) {
      const body = { ...base(), payout };
      const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
      assert.equal(r.status, 400, JSON.stringify(payout));
      assert.equal(await hotelByEmail(body.email), undefined);
    }
    const top = { ...base(), commissionPercent: 0, payout: { mode: "daily", payoutTime: "09:00" } };
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body: top });
    const h = await hotelByEmail(top.email);
    // zod strips unknown top-level keys: whatever happened, no commission was stored
    assert.equal(h?.commission_override_percent ?? null, null);
    assert.ok(r.status === 201 || r.status === 400);
  });

  test("older clients without payout settings receive the daily default", async () => {
    const body = base();
    const r = await http_(api.base, "/api/auth/register/hotel", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await hotelByEmail(body.email)).payout_mode, "daily");
    assert.equal(String((await hotelByEmail(body.email)).payout_time).slice(0, 5), "18:00");
  });

  test("existing hotels have a daily time and no fee override", async () => {
    const id = await makeHotel();
    const [h] = await q("SELECT payout_mode, payout_time, commission_override_percent FROM hotels WHERE id=$1", [id]);
    assert.deepEqual({ ...h }, { payout_mode: "daily", payout_time: "21:00:00", commission_override_percent: null });
  });

  test("the database itself rejects instant mode and missing payout times", async () => {
    const id = await makeHotel();
    await assert.rejects(q("UPDATE hotels SET payout_mode='instant' WHERE id=$1", [id]));
    await assert.rejects(q("UPDATE hotels SET payout_time=NULL WHERE id=$1", [id]));
  });
});

// ============================================================ fixed fee
describe("fixed 10% payout fee", { skip }, () => {
  test("redemption applies the fee once and freezes gross, fee, and net", async () => {
    mock.reset();
    const h = await makeHotel();
    const redeemed = await redeem(h, 100);
    assert.deepEqual([redeemed.commission, redeemed.hotelAmount], [10, 90]);
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(mock.count("POST", "/transfer"), 0);
  });

  test("instant mode and per-hotel fee overrides are no longer supported", async () => {
    const admin = await makeUser("mealvest_admin");
    const owner = await makeUser("hotel_owner");
    const h = await makeHotel();
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1,$2,'Owner','owner')", [owner.id, h]);
    const instant = await http_(api.base, `/api/admin/hotels/${h}/payout-settings`, { method: "PATCH", token: admin.token, body: { mode: "instant" } });
    assert.equal(instant.status, 400);
    const removed = await http_(api.base, `/api/admin/hotels/${h}/commission`, { method: "PATCH", token: admin.token, body: { commissionPercent: 1 } });
    assert.equal(removed.status, 404);
    const own = await http_(api.base, "/api/hotel/location", { method: "PATCH", token: owner.token, body: { commissionPercent: 0, description: "x" } });
    assert.ok([200, 400].includes(own.status));
    const [row] = await q("SELECT payout_mode, commission_override_percent FROM hotels WHERE id=$1", [h]);
    assert.deepEqual(row, { payout_mode: "daily", commission_override_percent: null });
  });

  test("hotel and admin views report the daily schedule and gross-fee-net breakdown", async () => {
    const admin = await makeUser("mealvest_admin");
    const owner = await makeUser("hotel_owner");
    const h = await makeHotel({ time: "21:00" });
    await q("INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1,$2,'Owner','owner')", [owner.id, h]);
    await redeem(h, 100);

    const list = await http_(api.base, "/api/admin/hotels", { token: admin.token });
    const row = list.data.hotels.find((x: any) => x.id === h);
    assert.equal(row.payout_mode, "daily");
    assert.equal(row.payout_time, "21:00");
    assert.equal(Number(row.payout_fee_percent), 10);

    const dash = await http_(api.base, "/api/hotel/dashboard", { token: owner.token });
    assert.equal(dash.data.stats.gross_revenue, "100.00");
    assert.equal(dash.data.stats.payout_fee_owed, "10.00");
    assert.equal(dash.data.stats.net_earnings, "90.00");

    const pay = await http_(api.base, "/api/hotel/payouts", { token: owner.token });
    assert.equal(pay.data.summary.pending_gross_amount, "100.00");
    assert.equal(pay.data.summary.pending_payout_fee_amount, "10.00");
    assert.equal(pay.data.summary.pending_amount, "90.00");
    assert.equal(pay.data.summary.payout_mode, "daily");
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

  test("redemption never pays immediately; the configured daily run is the only automatic settlement path", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ time: "21:00" });
    await redeem(h, 100); // 90 net, well over 40
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(mock.count("POST", "/transfer"), 0);
    await earn(s.id, h, [40]);
    const removedTrigger = await http_(api.base, "/api/admin/payouts/trigger", { method: "POST", body: { hotelId: h } });
    assert.equal(removedTrigger.status, 404);
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
    const claimed = await m.model.claimPendingOrdersForPayout(h, "PO-test-reserve-" + crypto.randomBytes(3).toString("hex"), null, "paystack", { perPayoutMaxKes: 5000, dailyMaxKes: 1e6 }, 40);
    assert.equal(Number(claimed.amount), 100);
    await earn(s.id, h, [20]); // arrives while the payout is being processed
    assert.equal(Number(claimed.amount), 100);
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [claimed.id]))[0].n, 1);
    assert.equal(await unpaid(h), 20);
  });

  test("a failed scheduled payout preserves the entitlement and waits for a safe admin retry", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel({ time: "21:00" });
    await earn(s.id, h, [80]);
    mock.nextTransfer = "400"; // definite provider rejection
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    const ps = await payoutsOf(h);
    assert.equal(ps.length, 1);
    assert.equal(ps[0].status, "failed");
    assert.equal(await unpaid(h), 80); // released back to unpaid, not lost
    assert.equal(mock.count("POST", "/transfer"), 1);
    // the next scheduled evaluation honours the existing failure cooldown instead of retrying blindly
    await m.daily.runDailyPayouts({ now: NEXT_DAY_2100 });
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("an administrator can retry only a confirmed failed payout", async () => {
    mock.reset();
    const admin = await makeUser("mealvest_admin");
    const s = await makeUser(); const h = await makeHotel({ time: "21:00" });
    await earn(s.id, h, [80]);
    mock.nextTransfer = "400";
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    const [failed] = await payoutsOf(h);

    const retry = await http_(api.base, `/api/admin/payouts/${failed.id}/retry`, { method: "POST", token: admin.token });
    assert.equal(retry.status, 201, JSON.stringify(retry.data));
    assert.equal(retry.data.payout.status, "successful");
    assert.equal(Number(retry.data.payout.amount), 80);
    assert.equal((await payoutsOf(h)).length, 2);
    assert.equal(mock.count("POST", "/transfer"), 2);

    const duplicate = await http_(api.base, `/api/admin/payouts/${failed.id}/retry`, { method: "POST", token: admin.token });
    assert.equal(duplicate.status, 404);
    assert.equal(mock.count("POST", "/transfer"), 2);
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

  test("instant mode cannot be re-enabled and unpaid earnings remain scheduled", async () => {
    mock.reset();
    const admin = await makeUser("mealvest_admin");
    const s = await makeUser(); const h = await makeHotel({ time: "21:00" });
    await earn(s.id, h, [100]);
    const r = await http_(api.base, `/api/admin/hotels/${h}/payout-settings`, { method: "PATCH", token: admin.token, body: { mode: "instant" } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 100);
    await m.daily.runDailyPayouts({ now: NAIROBI_2100 });
    assert.equal(Number((await payoutsOf(h))[0].amount), 100);
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
