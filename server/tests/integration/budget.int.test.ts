/**
 * Stage 1 budget-model integration tests: fixed daily allowance, additive
 * carry-forward, hold/settle/release, boosts, legacy-row compatibility and the
 * financial invariants. Real Postgres (TEST_DATABASE_URL), mock Paystack, no
 * real money. Days are "advanced" by shifting the plan's dates back one day, the
 * same thing the passage of a real day does to the lazy rollover.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mealvest_test npm run test:integration
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
  m.pay = await import("../../src/services/paymentService");
  m.budget = await import("../../src/services/budgetService");
  m.order = await import("../../src/services/orderService");
  m.jwt = await import("../../src/lib/jwt");
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
async function makeUser(role: "student" | "hotel_owner" = "student") {
  seq++;
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, 'password', false, 'active') RETURNING id`,
    [`b${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2547${String(seq + 500).padStart(8, "0")}`, await bcrypt.hash("password123", 4), await bcrypt.hash("1234", 4), role]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `Student ${seq}`]);
  return { id: u.id as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
async function makeHotel(price: number) {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent, commission_override_percent)
     VALUES ($1, 'active', 'send_money', $2, 10, 10) RETURNING id`,
    [`Hotel ${seq}`, JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" })]
  );
  const [item] = await q("INSERT INTO menu_items (hotel_id, name, price, category, available) VALUES ($1, 'Meal', $2, 'lunch', true) RETURNING id", [h.id, price]);
  return { id: h.id as string, itemId: item.id as string };
}
async function fund(userId: string, amount: number, days: number) {
  const reference = m.pay.generatePaymentReference();
  await m.pay.createPendingTransaction({ userId, hotelId: null, amount, phoneNumber: "254700000001", provider: "paystack", reference, numberOfDays: days });
  await m.pay.activatePaymentIfNeeded(reference, { reference, status: "success", amount, currency: "KES", providerTransactionId: "ps_1", paidAt: null, raw: {} });
}
const view = (userId: string) => m.budget.getActiveBudget(userId);
async function rawBudget(userId: string) {
  return (await q("SELECT * FROM budgets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [userId]))[0];
}
/** Hold a meal pass of `amount` (real path: createOrder -> payOrderFromBudget). */
async function hold(userId: string, amount: number) {
  const h = await makeHotel(amount);
  const o = await m.order.createOrder({ userId, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] });
  const paid = await m.order.payOrderFromBudget(o.id, userId);
  return { order: paid, hotelId: h.id };
}
/** Hold then scan: a completed purchase. */
async function eat(userId: string, amount: number) {
  const { order, hotelId } = await hold(userId, amount);
  const staff = await makeUser("hotel_owner");
  await m.order.redeemOrderByQr(order.qr_token, hotelId, staff.id);
  return order;
}
/** One real day passes: the plan's dates move one day into the past. */
async function nextDay(userId: string, n = 1) {
  await view(userId); // make sure the previous day is caught up first, as a real visit would
  await q(
    `UPDATE budgets SET start_date = start_date - $2::int, end_date = end_date - $2::int,
            last_spend_date = last_spend_date - $2::int WHERE user_id = $1 AND status = 'active'`,
    [userId, n]
  );
}
const num = (v: unknown) => Number(v);

async function assertInvariants(userId: string, fundedPlusBoosts: number) {
  const b = await rawBudget(userId);
  assert.ok(num(b.remaining_amount) >= 0, "remaining_amount >= 0");
  assert.ok(num(b.reserved_amount) >= 0, "reserved_amount >= 0");
  assert.ok(num(b.reserved_amount) <= num(b.remaining_amount), "reserved_amount <= remaining_amount");
  assert.ok(num(b.banked_amount) >= 0, "carry >= 0");
  assert.ok(num(b.banked_amount) <= num(b.remaining_amount), "carry <= remaining");
  // remaining + spent reconciles with what was funded (no withdrawals/adjustments in these tests)
  assert.equal(Math.round((num(b.remaining_amount) + num(b.amount_spent)) * 100), Math.round(fundedPlusBoosts * 100), "remaining + spent == funded");
  // spent against redeemed orders
  const [o] = await q("SELECT COALESCE(sum(amount),0) AS s FROM orders WHERE user_id = $1 AND status = 'redeemed'", [userId]);
  assert.equal(Math.round(num(o.s) * 100), Math.round(num(b.amount_spent) * 100), "amount_spent == redeemed orders");
  const [h] = await q("SELECT COALESCE(sum(amount),0) AS s FROM orders WHERE user_id = $1 AND status IN ('paid','ready')", [userId]);
  assert.equal(Math.round(num(h.s) * 100), Math.round(num(b.reserved_amount) * 100), "reserved_amount == open holds");
}

// ============================================================ scenarios
describe("Stage 1 budget model", { skip }, () => {
  test("S1: 3000/3 days — fixed 1000/day, carry 500 -> 250, 250 left at the end", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3);

    let v = await view(s.id);
    assert.equal(num(v.daily_allowance), 1000);
    assert.equal(v.available_today, 1000);

    await eat(s.id, 500); // day 1
    v = await view(s.id);
    assert.equal(v.available_today, 500);
    assert.equal(num(v.daily_allowance), 1000, "allowance did not move after spending");
    await assertInvariants(s.id, 3000);

    await nextDay(s.id); // day 2
    v = await view(s.id);
    assert.equal(num(v.daily_allowance), 1000, "allowance stays fixed (the old model would now say 1250)");
    assert.equal(v.carried_forward_amount, 500);
    assert.equal(v.available_today, 1500);

    await eat(s.id, 1250);
    await assertInvariants(s.id, 3000);
    await nextDay(s.id); // day 3
    v = await view(s.id);
    assert.equal(v.carried_forward_amount, 250);
    assert.equal(v.available_today, 1250);

    await eat(s.id, 1000);
    v = await view(s.id);
    assert.equal(num(v.remaining_amount), 250);
    assert.equal(v.available_today, 250);
    await assertInvariants(s.id, 3000);
  });

  test("S2: multiple purchases on one day — 1000 + 500 carried, 700 + 300 + 200 leaves 300 (carry not deducted repeatedly)", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3);
    await eat(s.id, 500);
    await nextDay(s.id);
    let v = await view(s.id);
    assert.equal(v.available_today, 1500);

    await eat(s.id, 700);
    assert.equal((await view(s.id)).available_today, 800);
    await eat(s.id, 300);
    assert.equal((await view(s.id)).available_today, 500);
    await eat(s.id, 200);
    v = await view(s.id);
    assert.equal(v.available_today, 300);
    assert.equal(v.carried_forward_amount, 500, "carry untouched until the day rolls over");
    assert.equal(num(v.spent_today), 1200);
    await assertInvariants(s.id, 3000);

    // The cap is real: 301 more is refused, 300 is fine.
    await assert.rejects(hold(s.id, 301), (e: any) => e.code === "DAILY_LIMIT_EXCEEDED");
    await eat(s.id, 300);
    assert.equal((await view(s.id)).available_today, 0);
    await assertInvariants(s.id, 3000);
  });

  test("S3: reservations — hold lowers available immediately, settle deducts exactly once, cancel releases exactly once", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3);
    const staff = await makeUser("hotel_owner");

    const a = await hold(s.id, 200);
    let v = await view(s.id);
    assert.equal(v.available_today, 800, "available drops immediately");
    assert.equal(v.held_amount, 200);
    assert.equal(num(v.remaining_amount), 3000, "nothing spent yet");
    assert.equal(v.free_plan_balance, 2800, "free plan balance = remaining - held");
    assert.equal(num(v.spent_today), 0);

    // A second hold cannot reuse held money: only 800 is free today.
    await assert.rejects(hold(s.id, 801), (e: any) => e.code === "DAILY_LIMIT_EXCEEDED");

    // Scan -> settled exactly once; a repeat scan is refused and moves nothing.
    await m.order.redeemOrderByQr(a.order.qr_token, a.hotelId, staff.id);
    await assert.rejects(m.order.redeemOrderByQr(a.order.qr_token, a.hotelId, staff.id), (e: any) => e.code === "ALREADY_REDEEMED");
    v = await view(s.id);
    assert.equal(num(v.remaining_amount), 2800);
    assert.equal(v.held_amount, 0);
    assert.equal(num(v.spent_today), 200);
    assert.equal(v.available_today, 800);

    // Cancel another hold: released once; a second cancel is a no-op.
    const b = await hold(s.id, 300);
    assert.equal((await view(s.id)).available_today, 500);
    await m.order.cancelHeldOrder(b.order.id, s.id);
    await m.order.cancelHeldOrder(b.order.id, s.id);
    v = await view(s.id);
    assert.equal(v.held_amount, 0);
    assert.equal(num(v.remaining_amount), 2800, "a released hold spends nothing");
    assert.equal(v.available_today, 800);
    await assertInvariants(s.id, 3000);
  });

  test("S4: several days — below / equal / above allowance, multiple purchases, outstanding hold, untouched days", async () => {
    const s = await makeUser();
    await fund(s.id, 5000, 5); // 1000/day
    const staff = await makeUser("hotel_owner");

    await eat(s.id, 400); // day 1: below allowance
    await assertInvariants(s.id, 5000);
    await nextDay(s.id); // day 2: 1000 + 600
    let v = await view(s.id);
    assert.equal(v.available_today, 1600);

    await eat(s.id, 1000); // exactly the allowance; carry untouched in-day
    assert.equal((await view(s.id)).available_today, 600);
    await nextDay(s.id); // day 3: unused 600 carried -> 1000 + 600
    v = await view(s.id);
    assert.equal(v.carried_forward_amount, 600);
    assert.equal(v.available_today, 1600);

    await eat(s.id, 900); // above allowance, multiple purchases
    await eat(s.id, 500);
    const open = await hold(s.id, 100); // outstanding hold at day end
    v = await view(s.id);
    assert.equal(v.available_today, 100);
    await assertInvariants(s.id, 5000);

    await nextDay(s.id); // day 4: carry = 1000 + 600 - 1400 = 200 (hold is not spent)
    v = await view(s.id);
    assert.equal(v.carried_forward_amount, 200);
    assert.equal(v.held_amount, 100);
    assert.equal(v.available_today, 1100, "1000 + 200 - 100 held");

    await m.order.redeemOrderByQr(open.order.qr_token, open.hotelId, staff.id); // settle the old hold today
    v = await view(s.id);
    assert.equal(v.available_today, 1100, "settling a hold must not change available (it was already subtracted)");
    assert.equal(num(v.spent_today), 100);
    await assertInvariants(s.id, 5000);

    await nextDay(s.id, 2); // untouched day: carry = unused(1100) + 1 skipped allowance, capped at remaining 2100
    v = await view(s.id);
    assert.equal(v.carried_forward_amount, 2100);
    assert.equal(v.available_today, 2100); // clamp to free plan balance
    await assertInvariants(s.id, 5000);
  });

  test("S5: retired transfer endpoint cannot move or create money; legacy parked amounts carry exactly once", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3);
    await eat(s.id, 500);
    const before = await rawBudget(s.id);

    const r = await http_(api.base, "/api/student/budget/transfer-to-next-day", { method: "POST", token: s.token });
    assert.equal(r.status, 410);
    const d = await http_(api.base, "/api/student/budget/rollover/decline", { method: "POST", token: s.token });
    assert.equal(d.status, 410);
    const c = await http_(api.base, "/api/student/budget/rollover/confirm", { method: "POST", token: s.token });
    assert.equal(c.status, 200);
    const after = await rawBudget(s.id);
    for (const k of ["remaining_amount", "amount_spent", "spent_today", "banked_amount", "reserved_amount", "pending_tomorrow_amount"]) {
      assert.equal(after[k], before[k], `${k} unchanged`);
    }

    // Legacy state left by the OLD transfer: carried 500, then "moved" 1500 -> spent_today 1500, pending_tomorrow 1500.
    const l = await makeUser();
    await fund(l.id, 3000, 3);
    await view(l.id);
    await q(`UPDATE budgets SET banked_amount = 500, spent_today = 1500, pending_tomorrow_amount = 1500 WHERE user_id = $1`, [l.id]);
    let v = await view(l.id);
    assert.equal(v.available_today, 0, "parked money is not spendable today");
    await nextDay(l.id);
    v = await view(l.id);
    assert.equal(v.carried_forward_amount, 1500, "carried exactly once (the old code produced 2000)");
    assert.equal(num(v.pending_tomorrow_amount), 0);
    // reading again never re-adds it
    assert.equal((await view(l.id)).carried_forward_amount, 1500);

    // Legacy pending_rollover is folded in once.
    const p = await makeUser();
    await fund(p.id, 3000, 3);
    await view(p.id);
    await q(`UPDATE budgets SET banked_amount = 100, pending_rollover_amount = 250 WHERE user_id = $1`, [p.id]);
    v = await view(p.id);
    assert.equal(v.carried_forward_amount, 350);
    assert.equal(num(v.pending_rollover_amount), 0);
    assert.equal((await view(p.id)).carried_forward_amount, 350);
  });

  test("S7: concurrency — parallel holds never exceed available or the plan, and invariants hold", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3); // 1000/day
    const hotels = await Promise.all(Array.from({ length: 12 }, () => makeHotel(150)));
    const orders = await Promise.all(hotels.map((h) => m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] })));
    const results = await Promise.allSettled(orders.map((o: any) => m.order.payOrderFromBudget(o.id, s.id)));
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 6, "1000 / 150 -> exactly 6 holds"); // 900 held, 100 left
    const v = await view(s.id);
    assert.equal(v.held_amount, 900);
    assert.equal(v.available_today, 100);
    await assertInvariants(s.id, 3000);
  });

  test("allowance is never recomputed from remaining/days (reads, spends and days leave it fixed)", async () => {
    const s = await makeUser();
    await fund(s.id, 1000, 3);
    assert.equal(num((await view(s.id)).daily_allowance), 333.33);
    await eat(s.id, 100);
    await nextDay(s.id);
    await view(s.id);
    await nextDay(s.id);
    assert.equal(num((await view(s.id)).daily_allowance), 333.33);
    assert.equal(num((await rawBudget(s.id)).daily_allowance), 333.33);
  });

  test("Meal Boost raises the FIXED allowance by boost/days-left and never redistributes carry-forward", async () => {
    const s = await makeUser();
    await fund(s.id, 3000, 3);
    await eat(s.id, 500);
    await nextDay(s.id); // day 2: carry 500, 2 days left (today + 1)
    const b = await rawBudget(s.id);
    const client = await m.db.pool.connect();
    try {
      await client.query("BEGIN");
      await m.budget.applyBoostInTx(client, b.id, 400);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const v = await view(s.id);
    assert.equal(num(v.daily_allowance), 1200, "1000 + 400 / 2 days left");
    assert.equal(v.carried_forward_amount, 500, "carry-forward untouched");
    assert.equal(num(v.remaining_amount), 2900);
    assert.equal(v.available_today, 1700);
    await assertInvariants(s.id, 3400);
  });
});
