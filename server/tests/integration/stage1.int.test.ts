/**
 * Stage 1 security/financial-integrity integration tests.
 * Real Postgres (TEST_DATABASE_URL), mock Paystack, no real money.
 *   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mealvest_test npm run test:integration
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { Client } from "pg";
import bcrypt from "bcrypt";
import { execFileSync } from "child_process";
import path from "path";
import { integrationEnabled, MockPaystack, resetDatabase, configureEnv, listen, http_, TEST_DB } from "./harness";

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
  m.payout = await import("../../src/services/hotelPayoutService");
  m.auth = await import("../../src/services/authService");
  m.jwt = await import("../../src/lib/jwt");
  m.recon = await import("../../src/services/reconciliationService");
  m.redis = await import("../../src/lib/redis");
  m.qr = await import("../../src/lib/qr");
  const { createApp } = await import("../../src/app");
  api = await listen(createApp());
});

after(async () => {
  if (!enabled) return;
  await api.close();
  await mock.stop();
  // let fire-and-forget notifications settle before closing the pool
  await new Promise((r) => setTimeout(r, 300));
  await m.db.pool.end();
});

// ---------------------------------------------------------------- helpers
async function q(sql: string, params: unknown[] = []) {
  return (await m.db.pool.query(sql, params)).rows;
}
let seq = 0;
async function makeUser(role: "student" | "mealvest_admin" | "hotel_owner" = "student", pin = "1234", pinCost = 4) {
  seq++;
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, 'password', false, 'active') RETURNING id, email`,
    [`u${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2547${String(seq).padStart(8, "0")}`, await bcrypt.hash("password123", 4), await bcrypt.hash(pin, pinCost), role]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `Student ${seq}`]);
  return { id: u.id as string, email: u.email as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
async function makeHotel(price = 30) {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent)
     VALUES ($1, 'active', 'send_money', $2, 10) RETURNING id`,
    [`Hotel ${seq}`, JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" })]
  );
  const [item] = await q(
    "INSERT INTO menu_items (hotel_id, name, price, category, available) VALUES ($1, 'Ugali', $2, 'lunch', true) RETURNING id",
    [h.id, price]
  );
  return { id: h.id as string, itemId: item.id as string };
}
function okVerify(reference: string, amount: number, extra: Partial<{ status: string; currency: string }> = {}) {
  return { reference, status: extra.status ?? "success", amount, currency: extra.currency ?? "KES", providerTransactionId: "ps_1", paidAt: null, raw: {} };
}
async function pendingTx(userId: string, amount: number, days = 30) {
  const reference = m.pay.generatePaymentReference();
  await m.pay.createPendingTransaction({ userId, hotelId: null, amount, phoneNumber: "254700000001", provider: "paystack", reference, numberOfDays: days });
  return reference as string;
}
async function fund(userId: string, amount: number, days = 30) {
  const ref = await pendingTx(userId, amount, days);
  await m.pay.activatePaymentIfNeeded(ref, okVerify(ref, amount));
  return ref;
}
async function activeBudget(userId: string) {
  return (await q("SELECT * FROM budgets WHERE user_id = $1 AND status = 'active'", [userId]))[0];
}
async function settled<T>(ps: Promise<T>[]) {
  const r = await Promise.allSettled(ps);
  return {
    ok: r.filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<T>).value),
    errors: r.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason),
  };
}
async function addRedeemedOrders(userId: string, hotelId: string, amounts: number[]) {
  for (const a of amounts) {
    await q(
      `INSERT INTO orders (user_id, hotel_id, items, amount, status, redeemed, commission_amount, hotel_amount)
       VALUES ($1, $2, '[]', $3, 'redeemed', true, $4, $5)`,
      [userId, hotelId, a, Math.round(a * 10) / 100, Math.round(a * 90) / 100]
    );
  }
}

// =================================================================== C1
describe("C1 budget integrity", { skip }, () => {
  test("POST /api/student/budget can no longer create a budget (410) and creates nothing", async () => {
    const s = await makeUser();
    const r = await http_(api.base, "/api/student/budget", { method: "POST", token: s.token, body: { totalAmount: 50000, numberOfDays: 30, termsAccepted: true } });
    assert.equal(r.status, 410);
    assert.equal(r.data.error.code, "FUNDING_REQUIRED");
    assert.equal((await q("SELECT count(*)::int n FROM budgets WHERE user_id=$1", [s.id]))[0].n, 0);
  });

  test("database rejects an unfunded budget, a failed/foreign/boost transaction, and transaction reuse", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const ins = (userId: string, txId: string | null) =>
      q(
        `INSERT INTO budgets (user_id, total_amount, remaining_amount, daily_allowance, number_of_days, start_date, end_date, status, funding_transaction_id)
         VALUES ($1, 1000, 1000, 33, 30, current_date, current_date + 30, 'completed', $2)`,
        [userId, txId]
      );
    await assert.rejects(ins(a.id, null), /must reference a funding transaction/);
    const refPending = await pendingTx(a.id, 1000);
    const [txPending] = await q("SELECT id FROM transactions WHERE provider_reference=$1", [refPending]);
    await assert.rejects(ins(a.id, txPending.id), /not successful/);
    const refPaid = await fund(a.id, 1000);
    const [txPaid] = await q("SELECT id FROM transactions WHERE provider_reference=$1", [refPaid]);
    await assert.rejects(ins(b.id, txPaid.id), /different user/);
    // replay: the same successful transaction cannot fund a second budget
    await assert.rejects(ins(a.id, txPaid.id), /duplicate key|idx_budgets_funding_transaction/);
  });

  test("a failed or pending payment never creates a budget", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 1500);
    const r1 = await m.pay.activatePaymentIfNeeded(ref, okVerify(ref, 1500, { status: "failed" }));
    assert.equal(r1.status, "failed");
    const ref2 = await pendingTx(s.id, 1500);
    const r2 = await m.pay.activatePaymentIfNeeded(ref2, okVerify(ref2, 1500, { status: "pending" }));
    assert.equal(r2.status, "processing");
    assert.equal(await activeBudget(s.id), undefined);
  });

  test("amount or currency mismatch never credits and is flagged for review", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 2000);
    await assert.rejects(m.pay.activatePaymentIfNeeded(ref, okVerify(ref, 1999.99)), /AMOUNT_MISMATCH|did not match/);
    const ref2 = await pendingTx(s.id, 2000);
    await assert.rejects(m.pay.activatePaymentIfNeeded(ref2, okVerify(ref2, 2000, { currency: "USD" })), /did not match/);
    assert.equal(await activeBudget(s.id), undefined);
    const rows = await q("SELECT needs_review, activated_at FROM transactions WHERE provider_reference = ANY($1)", [[ref, ref2]]);
    assert.ok(rows.every((r: any) => r.needs_review === true && r.activated_at === null));
  });

  test("20 concurrent duplicate callbacks credit exactly once", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 3000);
    const { ok, errors } = await settled(Array.from({ length: 20 }, () => m.pay.activatePaymentIfNeeded(ref, okVerify(ref, 3000))));
    assert.equal(errors.length, 0, String(errors[0]));
    assert.equal(ok.filter((r: any) => !r.alreadyProcessed).length, 1);
    const budgets = await q("SELECT remaining_amount FROM budgets WHERE user_id=$1", [s.id]);
    assert.equal(budgets.length, 1);
    assert.equal(Number(budgets[0].remaining_amount), 3000);
  });

  test("two different payments activating concurrently -> one plan, both amounts credited", async () => {
    const s = await makeUser();
    const r1 = await pendingTx(s.id, 1000);
    const r2 = await pendingTx(s.id, 700);
    await Promise.all([m.pay.activatePaymentIfNeeded(r1, okVerify(r1, 1000)), m.pay.activatePaymentIfNeeded(r2, okVerify(r2, 700))]);
    const budgets = await q("SELECT remaining_amount, total_amount FROM budgets WHERE user_id=$1", [s.id]);
    assert.equal(budgets.length, 1);
    assert.equal(Number(budgets[0].remaining_amount), 1700);
  });

  test("a legacy (pre-043, unfunded) budget keeps working", async () => {
    const s = await makeUser();
    await q("ALTER TABLE budgets DISABLE TRIGGER trg_budgets_require_funding");
    await q(
      `INSERT INTO budgets (user_id, total_amount, remaining_amount, daily_allowance, number_of_days, start_date, end_date, status)
       VALUES ($1, 3000, 3000, 100, 30, current_date, current_date + 30, 'active')`,
      [s.id]
    );
    await q("ALTER TABLE budgets ENABLE TRIGGER trg_budgets_require_funding");
    const b = await m.budget.getActiveBudget(s.id);
    assert.ok(b);
    const after = await m.budget.deductFromBudget(s.id, 40);
    assert.equal(Number(after.remaining_amount), 2960);
  });
});

// =================================================================== H1
describe("H1 atomic payment activation", { skip }, () => {
  test("a DB failure during activation rolls EVERYTHING back; a retry then succeeds once", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 2500);
    await q(`CREATE OR REPLACE FUNCTION test_fail_budget() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER test_fail_budget BEFORE INSERT ON budgets FOR EACH ROW WHEN (NEW.user_id = '${s.id}'::uuid) EXECUTE FUNCTION test_fail_budget()`);
    try {
      await assert.rejects(m.pay.activatePaymentIfNeeded(ref, okVerify(ref, 2500)), /injected failure/);
      const [tx] = await q("SELECT status, activated_at, activation_attempts FROM transactions WHERE provider_reference=$1", [ref]);
      // The old code had already COMMITTED 'success' here, stranding the money.
      assert.equal(tx.status, "pending");
      assert.equal(tx.activated_at, null);
      assert.equal(tx.activation_attempts, 1);
      assert.equal(await activeBudget(s.id), undefined);
    } finally {
      await q("DROP TRIGGER test_fail_budget ON budgets");
    }
    await m.pay.activatePaymentIfNeeded(ref, okVerify(ref, 2500));
    assert.equal(Number((await activeBudget(s.id)).remaining_amount), 2500);
  });

  test("Paystack webhook answers 500 on a transient failure (so Paystack retries) and 200 once processed", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 1200);
    mock.charges.set(ref, { status: "success", amountKobo: 120000, currency: "KES" });
    const body = JSON.stringify({ event: "charge.success", data: { reference: ref } });
    const sig = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");
    const send = () =>
      fetch(`${api.base}/api/webhooks/paystack`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": sig }, body });
    await q(`CREATE TRIGGER test_fail_budget BEFORE INSERT ON budgets FOR EACH ROW WHEN (NEW.user_id = '${s.id}'::uuid) EXECUTE FUNCTION test_fail_budget()`);
    try {
      assert.equal((await send()).status, 500);
    } finally {
      await q("DROP TRIGGER test_fail_budget ON budgets");
    }
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200); // redelivery: no-op
    assert.equal((await q("SELECT count(*)::int n FROM budgets WHERE user_id=$1", [s.id]))[0].n, 1);
    const bad = await fetch(`${api.base}/api/webhooks/paystack`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": "00" }, body });
    assert.equal(bad.status, 401);
  });

  test("provider record for a different reference is never accepted", async () => {
    const s = await makeUser();
    const ref = await pendingTx(s.id, 900);
    mock.charges.set(ref, { status: "success", amountKobo: 90000, currency: "KES", reference: "MV-someone-else" });
    const r = await http_(api.base, `/api/payments/verify/${ref}`, { token: s.token });
    assert.equal(r.status, 502);
    assert.equal(await activeBudget(s.id), undefined);
  });

  test("reconciliation repairs paid-but-unactivated payments exactly once and never marks unpaid ones paid", async () => {
    const s = await makeUser();
    const refPaid = await pendingTx(s.id, 1100);
    const refUnpaid = await pendingTx(s.id, 1300);
    await q("UPDATE transactions SET created_at = now() - interval '5 minutes' WHERE provider_reference = ANY($1)", [[refPaid, refUnpaid]]);
    mock.charges.set(refPaid, { status: "success", amountKobo: 110000, currency: "KES" });
    mock.charges.set(refUnpaid, { status: "abandoned", amountKobo: 130000, currency: "KES" });
    const [r1, r2] = await Promise.all([m.recon.reconcilePayments(50), m.recon.reconcilePayments(50)]);
    assert.equal(r1.activated + r2.activated, 1);
    await q("UPDATE transactions SET reconcile_claimed_until = NULL");
    await m.recon.reconcilePayments(50);
    const rows = await q("SELECT provider_reference, status, activated_at FROM transactions WHERE provider_reference = ANY($1)", [[refPaid, refUnpaid]]);
    const paid = rows.find((r: any) => r.provider_reference === refPaid);
    const unpaid = rows.find((r: any) => r.provider_reference === refUnpaid);
    assert.equal(paid.status, "success");
    assert.ok(paid.activated_at);
    assert.notEqual(unpaid.status, "success");
    assert.equal(unpaid.activated_at, null);
    assert.equal(Number((await activeBudget(s.id)).remaining_amount), 1100);
  });

  test("cron endpoint requires the secret", async () => {
    assert.equal((await http_(api.base, "/api/cron/reconcile")).status, 401);
    assert.equal((await http_(api.base, "/api/cron/reconcile", { headers: { Authorization: "Bearer wrong" } })).status, 401);
    const ok = await http_(api.base, "/api/cron/reconcile", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.payments && ok.data.payouts);
  });
});

// =================================================================== H2
describe("H2 atomic meal payment", { skip }, () => {
  test("concurrent orders can never overspend (100/day budget, 10 × KSh 30 orders -> exactly 3 paid)", async () => {
    const s = await makeUser();
    const h = await makeHotel(30);
    await fund(s.id, 3000, 30); // 100/day
    const orders = [];
    for (let i = 0; i < 10; i++) orders.push(await m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] }));
    const { ok, errors } = await settled(orders.map((o) => m.order.payOrderFromBudget(o.id, s.id)));
    assert.equal(ok.length, 3);
    assert.ok(errors.every((e: any) => e.code === "DAILY_LIMIT_EXCEEDED"));
    const b = await activeBudget(s.id);
    assert.equal(Number(b.remaining_amount), 2910);
    assert.equal(Number(b.spent_today), 90);
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE user_id=$1 AND status='paid'", [s.id]))[0].n, 3);
  });

  test("paying the same order 10 times concurrently deducts once", async () => {
    const s = await makeUser();
    const h = await makeHotel(25);
    await fund(s.id, 3000, 30);
    const o = await m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] });
    await Promise.all(Array.from({ length: 10 }, () => m.order.payOrderFromBudget(o.id, s.id)));
    assert.equal(Number((await activeBudget(s.id)).remaining_amount), 2975);
  });

  test("same idempotency key concurrently -> one order", async () => {
    const s = await makeUser();
    const h = await makeHotel(25);
    const key = `idem-${crypto.randomUUID()}`;
    const res = await Promise.all(Array.from({ length: 8 }, () => m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }], idempotencyKey: key })));
    assert.equal(new Set(res.map((o: any) => o.id)).size, 1);
    const other = await makeUser();
    await assert.rejects(m.order.createOrder({ userId: other.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }], idempotencyKey: key }), /does not belong/);
  });

  test("if the order update fails, the deduction is rolled back", async () => {
    const s = await makeUser();
    const h = await makeHotel(25);
    await fund(s.id, 3000, 30);
    const o = await m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] });
    await q(`CREATE OR REPLACE FUNCTION test_fail_order() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected order failure'; END $$ LANGUAGE plpgsql`);
    await q(`CREATE TRIGGER test_fail_order BEFORE UPDATE ON orders FOR EACH ROW WHEN (NEW.id = '${o.id}'::uuid AND NEW.status = 'paid') EXECUTE FUNCTION test_fail_order()`);
    try {
      await assert.rejects(m.order.payOrderFromBudget(o.id, s.id), /injected order failure/);
    } finally {
      await q("DROP TRIGGER test_fail_order ON orders");
    }
    const b = await activeBudget(s.id);
    assert.equal(Number(b.remaining_amount), 3000);
    assert.equal(Number(b.spent_today), 0);
    assert.equal((await q("SELECT status FROM orders WHERE id=$1", [o.id]))[0].status, "pending_payment");
  });

  test("if the deduction fails, the order stays unpaid and has no QR", async () => {
    const s = await makeUser();
    const h = await makeHotel(500);
    await fund(s.id, 3000, 30); // 100/day < 500
    const o = await m.order.createOrder({ userId: s.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] });
    await assert.rejects(m.order.payOrderFromBudget(o.id, s.id), /today's available balance/);
    const [row] = await q("SELECT status, qr_token FROM orders WHERE id=$1", [o.id]);
    assert.equal(row.status, "pending_payment");
    assert.equal(row.qr_token, null);
  });

  test("a hotel cannot redeem another hotel's meal; 'ready' orders are redeemable", async () => {
    const s = await makeUser();
    const h1 = await makeHotel(25);
    const h2 = await makeHotel(25);
    const staff = await makeUser("hotel_owner");
    await fund(s.id, 3000, 30);
    const o = await m.order.createOrder({ userId: s.id, hotelId: h1.id, lines: [{ itemId: h1.itemId, quantity: 1 }] });
    const paid = await m.order.payOrderFromBudget(o.id, s.id);
    await assert.rejects(m.order.redeemOrderByQr(paid.qr_token, h2.id, staff.id), /different hotel/);
    await m.order.markOrderReady(o.id, h1.id);
    const redeemed = await m.order.redeemOrderByQr(paid.qr_token, h1.id, staff.id);
    assert.equal(redeemed.status, "redeemed");
    await assert.rejects(m.order.redeemOrderByQr(paid.qr_token, h1.id, staff.id), /already been redeemed/);
  });
});

// =================================================================== H3
describe("H3 payout integrity", { skip }, () => {
  let admin: { id: string; token: string };
  before(async () => {
    if (!enabled) return;
    admin = await makeUser("mealvest_admin");
  });

  test("5 concurrent 'Pay out' clicks -> one payout row, one provider transfer", async () => {
    mock.reset();
    const s = await makeUser();
    const h = await makeHotel();
    await addRedeemedOrders(s.id, h.id, [100, 200]);
    const { ok, errors } = await settled(Array.from({ length: 5 }, () => m.payout.triggerPayout(h.id, admin.id)));
    assert.equal(ok.length, 1);
    assert.ok(errors.every((e: any) => ["NOTHING_TO_PAY_OUT", "PAYOUT_ALREADY_PENDING"].includes(e.code)), errors.map((e: any) => e.code).join());
    assert.equal(mock.count("POST", "/transfer"), 1);
    assert.equal(Number(ok[0].amount), 270);
    assert.equal(ok[0].status, "processing");
  });

  test("lost response (timeout) -> 'unknown', orders stay claimed, no second transfer; reconciles under the SAME reference", async () => {
    mock.reset();
    const s = await makeUser();
    const h = await makeHotel();
    await addRedeemedOrders(s.id, h.id, [100]);
    mock.nextTransfer = "drop"; // transfer is created at the provider, response lost
    const p = await m.payout.triggerPayout(h.id, admin.id);
    assert.equal(p.status, "unknown");
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [p.id]))[0].n, 1);
    await assert.rejects(m.payout.triggerPayout(h.id, admin.id), /no redeemed orders/);
    assert.equal(mock.count("POST", "/transfer"), 1);

    const afterVerify = await m.payout.verifyPayout(p.id);
    assert.equal(afterVerify.status, "processing"); // found by reference
    mock.transfers.get(p.transfer_reference)!.status = "success";
    const final = await m.payout.verifyPayout(p.id);
    assert.equal(final.status, "successful");
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("unknown outcome where the provider has NO record: no re-send before the grace period, then re-send with the same reference", async () => {
    mock.reset();
    const s = await makeUser();
    const h = await makeHotel();
    await addRedeemedOrders(s.id, h.id, [150]);
    mock.nextTransfer = "drop";
    mock.createOnDrop = false; // request never reached the provider
    const p = await m.payout.triggerPayout(h.id, admin.id);
    assert.equal(p.status, "unknown");
    assert.equal((await m.payout.verifyPayout(p.id)).status, "unknown");
    assert.equal(mock.count("POST", "/transfer"), 1);
    await q("UPDATE hotel_payouts SET submitted_at = now() - interval '10 minutes' WHERE id=$1", [p.id]);
    const after = await m.payout.verifyPayout(p.id);
    assert.equal(after.status, "processing");
    const posts = mock.requests.filter((r) => r.method === "POST" && r.path === "/transfer");
    assert.equal(posts.length, 2);
    assert.ok(posts.every((r) => r.body.reference === p.transfer_reference));
  });

  test("provider 5xx is NOT a failure (orders stay claimed); a clear 400 rejection IS (orders released)", async () => {
    mock.reset();
    const s = await makeUser();
    const h = await makeHotel();
    await addRedeemedOrders(s.id, h.id, [100]);
    mock.nextTransfer = "500";
    const p = await m.payout.triggerPayout(h.id, admin.id);
    assert.equal(p.status, "unknown");
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [p.id]))[0].n, 1);

    const h2 = await makeHotel();
    await addRedeemedOrders(s.id, h2.id, [100]);
    mock.nextTransfer = "400";
    const p2 = await m.payout.triggerPayout(h2.id, admin.id);
    assert.equal(p2.status, "failed");
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE hotel_id=$1 AND payout_id IS NULL", [h2.id]))[0].n, 1);
  });

  test("over the per-payout limit -> held in review (nothing sent); cancel releases; approve sends once", async () => {
    mock.reset();
    const s = await makeUser();
    const h = await makeHotel();
    await addRedeemedOrders(s.id, h.id, [4000, 3000]); // 6300 net > 5000 limit
    const p = await m.payout.triggerPayout(h.id, admin.id);
    assert.equal(p.status, "review");
    assert.equal(mock.count("POST", "/transfer"), 0);
    const cancelled = await m.payout.cancelPayout(p.id, admin.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE hotel_id=$1 AND payout_id IS NULL", [h.id]))[0].n, 2);

    const p2 = await m.payout.triggerPayout(h.id, admin.id);
    assert.equal(p2.status, "review");
    // Dual control (Stage 2, M8): the initiating admin may not approve.
    await assert.rejects(m.payout.approveAndSubmitPayout(p2.id, admin.id), (e: any) => e.code === "DUAL_APPROVAL_REQUIRED");
    const second = await makeUser("mealvest_admin");
    const [a, b] = await Promise.allSettled([m.payout.approveAndSubmitPayout(p2.id, second.id), m.payout.approveAndSubmitPayout(p2.id, second.id)]);
    assert.equal([a, b].filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("illegal state transitions and amount changes are rejected by the database", async () => {
    const [row] = await q("SELECT id FROM hotel_payouts WHERE status='successful' LIMIT 1");
    await assert.rejects(q("UPDATE hotel_payouts SET status='pending' WHERE id=$1", [row.id]), /illegal status transition/);
    await assert.rejects(q("UPDATE hotel_payouts SET amount = amount + 1 WHERE id=$1", [row.id]), /immutable/);
  });

  test("students and hotels cannot use admin payout endpoints", async () => {
    const s = await makeUser();
    const h = await makeUser("hotel_owner");
    for (const t of [s.token, h.token]) {
      const r = await http_(api.base, "/api/admin/payouts/trigger", { method: "POST", token: t, body: { hotelId: crypto.randomUUID() } });
      assert.equal(r.status, 403);
    }
    assert.equal((await http_(api.base, "/api/admin/payouts/trigger", { method: "POST", body: {} })).status, 401);
  });
});

// =================================================================== H4 / H7 / access control
describe("H4 PIN, H7 Google, access control", { skip }, () => {
  test("12 parallel wrong PINs: at most 3 are reported incorrect, the account locks, and then the right PIN is refused", async () => {
    // Production bcrypt cost (12): the real-world race window between the lock check and the compare.
    const s = await makeUser("student", "4321", 12);
    // What matters is how many guesses were actually EVALUATED, not what
    // the responses say (a guess compared before the lock landed still
    // tells an attacker whether it was right). Count bcrypt comparisons.
    const realCompare = bcrypt.compare;
    let compares = 0;
    (bcrypt as any).compare = (...args: any[]) => {
      compares++;
      return (realCompare as any).apply(bcrypt, args);
    };
    let errors: any[];
    try {
      ({ errors } = await settled(Array.from({ length: 12 }, () => m.auth.verifyPinForUserId(s.id, "0000"))));
    } finally {
      (bcrypt as any).compare = realCompare;
    }
    assert.ok(compares <= 4, `${compares} PIN guesses were evaluated (limit is 4)`);
    const codes = errors.map((e: any) => e.code);
    assert.ok(codes.filter((c: string) => c === "PIN_INCORRECT").length <= 3, codes.join());
    assert.ok(codes.every((c: string) => ["PIN_INCORRECT", "PIN_LOCKED", "PIN_TRY_AGAIN"].includes(c)), codes.join());
    await assert.rejects(m.auth.verifyPinForUserId(s.id, "4321"), (e: any) => e.code === "PIN_LOCKED");
  });

  test("a correct PIN resets earlier failures; concurrent correct PINs never lock the user", async () => {
    const s = await makeUser("student", "4321");
    await assert.rejects(m.auth.verifyPinForUserId(s.id, "0000"));
    await assert.rejects(m.auth.verifyPinForUserId(s.id, "0001"));
    await m.auth.verifyPinForUserId(s.id, "4321");
    assert.equal((await q("SELECT pin_failed_attempts FROM users WHERE id=$1", [s.id]))[0].pin_failed_attempts, 0);
    await settled(Array.from({ length: 8 }, () => m.auth.verifyPinForUserId(s.id, "4321")));
    const [u] = await q("SELECT pin_locked_until, pin_failed_attempts FROM users WHERE id=$1", [s.id]);
    assert.equal(u.pin_locked_until, null);
    assert.equal(u.pin_failed_attempts, 0);
  });

  test("Google: unverified email rejected; matching email never auto-links; hotel/admin cannot use Google", async () => {
    const existing = await makeUser();
    const base = { name: "X", picture: null, issuedAt: Math.floor(Date.now() / 1000) };
    await assert.rejects(m.auth.loginWithGoogle({ ...base, googleId: "g-unverified", email: "new@x.test", emailVerified: false }), (e: any) => e.code === "GOOGLE_EMAIL_UNVERIFIED");
    await assert.rejects(m.auth.loginWithGoogle({ ...base, googleId: "g-attacker", email: existing.email, emailVerified: true }), (e: any) => e.code === "ACCOUNT_LINK_REQUIRED");
    assert.equal((await q("SELECT google_id FROM users WHERE id=$1", [existing.id]))[0].google_id, null);

    const owner = await makeUser("hotel_owner");
    await q("UPDATE users SET google_id='g-hotel' WHERE id=$1", [owner.id]);
    await assert.rejects(m.auth.loginWithGoogle({ ...base, googleId: "g-hotel", email: owner.email, emailVerified: true }), (e: any) => e.code === "GOOGLE_LOGIN_NOT_ALLOWED");

    // explicit link requires the password, and a Google identity can't serve two users
    await assert.rejects(m.auth.linkGoogleAccount(existing.id, { ...base, googleId: "g-link", email: existing.email, emailVerified: true }, "wrong"), (e: any) => e.code === "INVALID_CREDENTIALS");
    await m.auth.linkGoogleAccount(existing.id, { ...base, googleId: "g-link", email: existing.email, emailVerified: true }, "password123");
    const other = await makeUser();
    await assert.rejects(m.auth.linkGoogleAccount(other.id, { ...base, googleId: "g-link", email: other.email, emailVerified: true }, "password123"), (e: any) => e.code === "GOOGLE_IN_USE");
    const r = await m.auth.loginWithGoogle({ ...base, googleId: "g-link", email: existing.email, emailVerified: true });
    assert.equal(r.user.id, existing.id);
  });

  test("unauthenticated and cross-student access is refused", async () => {
    assert.equal((await http_(api.base, "/api/student/budget")).status, 401);
    assert.equal((await http_(api.base, "/api/orders")).status, 401);
    const a = await makeUser();
    const b = await makeUser();
    const h = await makeHotel(25);
    const o = await m.order.createOrder({ userId: a.id, hotelId: h.id, lines: [{ itemId: h.itemId, quantity: 1 }] });
    assert.equal((await http_(api.base, `/api/orders/${o.id}`, { token: b.token })).status, 403);
    assert.equal((await http_(api.base, `/api/orders/${o.id}/pay`, { method: "POST", token: b.token })).status, 403);
    const ref = await pendingTx(a.id, 800);
    assert.equal((await http_(api.base, `/api/payments/verify/${ref}`, { token: b.token })).status, 403);
    assert.equal((await http_(api.base, `/api/payments/${ref}/status`, { token: b.token })).status, 404);
    assert.equal((await http_(api.base, "/api/hotel/dashboard", { token: a.token })).status, 403);
  });
});

// =================================================================== M1
describe("M1 withdrawals", { skip }, () => {
  async function endedPlan(amount = 3000) {
    const s = await makeUser("student", "2468");
    await fund(s.id, amount, 30);
    await q("UPDATE budgets SET end_date = current_date - 1 WHERE user_id=$1", [s.id]);
    return s;
  }
  const body = (pin?: string) => ({ payoutMethod: "mpesa", payoutDestination: "0700000001", acceptFee: true, ...(pin ? { pin } : {}) });

  test("5 concurrent withdrawal requests with the right PIN -> exactly one withdrawal", async () => {
    const s = await endedPlan();
    const res = await Promise.all(Array.from({ length: 5 }, () => http_(api.base, "/api/student/withdraw", { method: "POST", token: s.token, body: body("2468") })));
    assert.equal(res.filter((r) => r.status === 201).length, 1, JSON.stringify(res.map((r) => [r.status, r.data?.error?.code])));
    assert.equal((await q("SELECT count(*)::int n FROM savings_withdrawals WHERE user_id=$1", [s.id]))[0].n, 1);
    assert.equal((await q("SELECT pin_locked_until FROM users WHERE id=$1", [s.id]))[0].pin_locked_until, null);
  });

  test("rejection restores exactly once (even concurrently) and allows a new request", async () => {
    const s = await endedPlan(2000);
    const w = await http_(api.base, "/api/student/withdraw", { method: "POST", token: s.token, body: body("2468") });
    assert.equal(w.status, 201);
    const admin = await makeUser("mealvest_admin");
    const res = await Promise.all(
      [1, 2, 3].map(() => http_(api.base, `/api/admin/withdrawals/${w.data.withdrawalId}`, { method: "PATCH", token: admin.token, body: { status: "rejected", note: "test" } }))
    );
    assert.equal(res.filter((r) => r.status === 200).length, 1, JSON.stringify(res.map((r) => r.status)));
    assert.ok(res.filter((r) => r.status !== 200).every((r) => r.status === 409));
    const b = await activeBudget(s.id);
    assert.equal(Number(b.remaining_amount), 2000);
    const [row] = await q("SELECT status, restored_amount FROM savings_withdrawals WHERE id=$1", [w.data.withdrawalId]);
    assert.equal(row.status, "rejected");
    assert.equal(Number(row.restored_amount), 2000);
    // can't be "re-rejected" or reopened at the DB level either
    await assert.rejects(q("UPDATE savings_withdrawals SET status='pending' WHERE id=$1", [w.data.withdrawalId]), /final/);
    const again = await http_(api.base, "/api/student/withdraw", { method: "POST", token: s.token, body: body("2468") });
    assert.equal(again.status, 201);
  });

  test("students cannot reject (restore) their own withdrawal", async () => {
    const s = await endedPlan(1500);
    const w = await http_(api.base, "/api/student/withdraw", { method: "POST", token: s.token, body: body("2468") });
    const r = await http_(api.base, `/api/admin/withdrawals/${w.data.withdrawalId}`, { method: "PATCH", token: s.token, body: { status: "rejected" } });
    assert.equal(r.status, 403);
  });
});

// =================================================================== H6
describe("H6 Row Level Security", { skip }, () => {
  test("Supabase API roles cannot read app tables, even if a grant is re-added", async () => {
    await makeUser();
    const c = new Client({ connectionString: TEST_DB });
    await c.connect();
    try {
      await c.query("SET ROLE anon");
      await assert.rejects(c.query("SELECT * FROM users"), /permission denied/);
      await c.query("RESET ROLE");
      await c.query("GRANT SELECT ON users, transactions TO anon, authenticated"); // simulate an accidental re-grant
      for (const role of ["anon", "authenticated"]) {
        await c.query(`SET ROLE ${role}`);
        assert.equal((await c.query("SELECT * FROM users")).rows.length, 0, `${role} saw rows`);
        assert.equal((await c.query("SELECT * FROM transactions")).rows.length, 0);
        await c.query("RESET ROLE");
      }
    } finally {
      await c.query("RESET ROLE").catch(() => {});
      await c.query("REVOKE SELECT ON users, transactions FROM anon, authenticated").catch(() => {});
      await c.end();
    }
  });

  test("scripts/checkRls.js passes on the migrated schema and fails when a table lacks RLS", async () => {
    const script = path.join(__dirname, "..", "..", "scripts", "checkRls.js");
    execFileSync(process.execPath, [script], { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
    await q("CREATE TABLE test_unprotected (id int)");
    try {
      assert.throws(() => execFileSync(process.execPath, [script], { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" }));
    } finally {
      await q("DROP TABLE test_unprotected");
    }
  });
});

// =================================================================== H5 (last: mutates limiter state)
describe("H5 rate limiting", { skip }, () => {
  class FakeRedis {
    store = new Map<string, { v: number; exp: number }>();
    fail = false;
    async pipeline(cmds: (string | number)[][]) {
      if (this.fail) throw new Error("connection refused");
      const now = Date.now();
      return cmds.map(([cmd, key, ...rest]) => {
        const k = String(key);
        const e = this.store.get(k);
        const live = e && e.exp > now ? e : undefined;
        switch (cmd) {
          case "SET":
            if (!live) this.store.set(k, { v: Number(rest[0]), exp: now + Number(rest[2]) });
            return live ? null : "OK";
          case "INCR": {
            const cur = live ?? { v: 0, exp: now + 60_000 };
            cur.v++;
            this.store.set(k, cur);
            return cur.v;
          }
          case "PTTL":
            return live || this.store.get(k) ? (this.store.get(k)!.exp - now) : -2;
          case "DECR":
            if (live) live.v--;
            return live?.v ?? 0;
          case "DEL":
            this.store.delete(k);
            return 1;
          case "PEXPIRE":
            return 1;
          default:
            throw new Error(`unsupported ${cmd}`);
        }
      });
    }
  }

  test("refresh-token rotation is rate limited (shared store)", async () => {
    const redis = new FakeRedis();
    m.redis.setRedisClientForTests(redis);
    try {
      let last = 0;
      for (let i = 0; i < 61; i++) last = (await http_(api.base, "/api/auth/refresh", { method: "POST", body: { refreshToken: "x".repeat(20) } })).status;
      assert.equal(last, 429);
      assert.ok([...redis.store.keys()].every((k) => k.startsWith("mv:rl:") && !k.includes("@")));
    } finally {
      m.redis.setRedisClientForTests(undefined);
    }
  });

  test("Redis outage -> sensitive endpoints fail CLOSED (503), never unlimited", async () => {
    const redis = new FakeRedis();
    redis.fail = true;
    m.redis.setRedisClientForTests(redis);
    try {
      const r = await http_(api.base, "/api/auth/login", { method: "POST", body: { identifier: "a@b.test", password: "x" } });
      assert.equal(r.status, 503);
      assert.equal(r.data.error.code, "RATE_LIMIT_UNAVAILABLE");
      const s = await makeUser();
      const p = await http_(api.base, "/api/payments/initialize", { method: "POST", token: s.token, body: {} });
      assert.equal(p.status, 503);
    } finally {
      m.redis.setRedisClientForTests(undefined);
    }
  });

  test("production without Redis refuses sensitive endpoints unless explicitly opted out", async () => {
    m.redis.setRedisClientForTests(null);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const r = await http_(api.base, "/api/auth/login", { method: "POST", body: { identifier: "a@b.test", password: "x" } });
      assert.equal(r.status, 503);
    } finally {
      process.env.NODE_ENV = prev;
      m.redis.setRedisClientForTests(undefined);
    }
  });
});
