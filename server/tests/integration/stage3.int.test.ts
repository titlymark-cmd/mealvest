/**
 * Stage 3 — automated hotel payouts, KSh 40 threshold, payout status tracking.
 * Real Postgres (TEST_DATABASE_URL, localhost only) + the in-process mock
 * Paystack. NO real provider is called, no money moves. Cyzora payout
 * webhooks are exercised by applying events to rows we create ourselves;
 * nothing here fabricates a provider response.
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
  process.env.AUTO_PAYOUTS_ENABLED = "true";
  process.env.AUTO_PAYOUT_THRESHOLD_KES = "40";
  await resetDatabase();
  m.db = await import("../../src/config/db");
  m.env = await import("../../src/config/env");
  m.order = await import("../../src/services/orderService");
  m.payout = await import("../../src/services/hotelPayoutService");
  m.model = await import("../../src/models/hotelPayoutModel");
  m.recon = await import("../../src/services/reconciliationService");
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
    [`s3u${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`, `2547${String(seq + 5000).padStart(8, "0")}`, await bcrypt.hash("password123", 4), await bcrypt.hash("1234", 4), role]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `Student ${seq}`]);
  return { id: u.id as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
async function makeHotel() {
  seq++;
  const [h] = await q(
    `INSERT INTO hotels (name, status, payment_method, payment_details, commission_percent)
     VALUES ($1, 'active', 'send_money', $2, 10) RETURNING id`,
    [`S3 Hotel ${seq}`, JSON.stringify({ method: "send_money", phoneNumber: "0700000001", accountHolderName: "Owner" })]
  );
  return h.id as string;
}
/** Redeemed orders whose HOTEL earnings are exactly these amounts (commission 0 so the numbers match the business examples). */
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
async function settled<T>(ps: Promise<T>[]) {
  const r = await Promise.allSettled(ps);
  return { ok: r.filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<T>).value), errors: r.filter((x) => x.status === "rejected").map((x) => (x as PromiseRejectedResult).reason) };
}
/** Backdate a payout timestamp. set_updated_at would otherwise reset updated_at, so disable it for this statement (throwaway test DB only). */
async function backdate(hotelId: string, column: "updated_at" | "created_at" | "submitted_at", interval: string) {
  const c = await m.db.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("ALTER TABLE hotel_payouts DISABLE TRIGGER trg_hotel_payouts_updated_at");
    await c.query(`UPDATE hotel_payouts SET ${column} = now() - interval '${interval}' WHERE hotel_id = $1`, [hotelId]);
    await c.query("ALTER TABLE hotel_payouts ENABLE TRIGGER trg_hotel_payouts_updated_at");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
async function waitFor(fn: () => Promise<boolean>, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}
async function insertCyzoraPayout(hotelId: string, userId: string, status: "processing" | "unknown", amount: number, code: string | null) {
  const [p] = await q(
    `INSERT INTO hotel_payouts (hotel_id, amount, transfer_reference, provider, status, transfer_code)
     VALUES ($1, $2, $3, 'cyzora', $4, $5) RETURNING *`,
    [hotelId, amount, `PO-test-${crypto.randomBytes(4).toString("hex")}`, status, code]
  );
  await earn(userId, hotelId, [amount]);
  await q("UPDATE orders SET payout_id=$1 WHERE hotel_id=$2 AND payout_id IS NULL AND redeemed", [p.id, hotelId]);
  return p;
}

// ============================================================ thresholds
describe("KSh 40 accumulation threshold", { skip }, () => {
  test("KSh 15 -> no payout; KSh 15 + 12 = 27 -> still none, full 27 preserved as payable", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [15]);
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "below_threshold");
    await earn(s.id, h, [12]);
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "below_threshold");
    assert.equal(mock.count("POST", "/transfer"), 0);
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 27);
  });

  test("KSh 27 + 18 -> ONE payout of 45 covering all three orders (not just 18)", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [15, 12]);
    await m.payout.evaluateAutoPayout(h);
    await earn(s.id, h, [18]);
    const r = await m.payout.evaluateAutoPayout(h);
    assert.equal(r.action, "initiated");
    assert.equal(Number(r.payout.amount), 45);
    assert.equal(r.payout.initiated_by_admin_id, null); // automatic
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [r.payout.id]))[0].n, 3);
    assert.equal(await unpaid(h), 0);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("Scenario A: 35 + 10 = 45 pays 45", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [35]);
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "below_threshold");
    await earn(s.id, h, [10]);
    const r = await m.payout.evaluateAutoPayout(h);
    assert.equal(Number(r.payout.amount), 45);
  });

  test("39.99 -> no payout; exactly 40 -> payout (>=, not >)", async () => {
    mock.reset();
    const s = await makeUser(); const a = await makeHotel(); const b = await makeHotel();
    await earn(s.id, a, [39.99]);
    assert.equal((await m.payout.evaluateAutoPayout(a)).action, "below_threshold");
    await earn(s.id, b, [40]);
    const r = await m.payout.evaluateAutoPayout(b);
    assert.equal(r.action, "initiated");
    assert.equal(Number(r.payout.amount), 40);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("manual admin payout also respects the threshold and keeps the balance", async () => {
    const s = await makeUser(); const admin = await makeUser("mealvest_admin"); const h = await makeHotel();
    await earn(s.id, h, [25]);
    await assert.rejects(m.payout.triggerPayout(h, admin.id), (e: any) => e.code === "BELOW_PAYOUT_THRESHOLD");
    assert.equal(await unpaid(h), 25);
  });

  test("feature switch off -> nothing happens", async () => {
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [100]);
    m.env.env.autoPayoutsEnabled = false;
    try { assert.equal((await m.payout.evaluateAutoPayout(h)).action, "disabled"); } finally { m.env.env.autoPayoutsEnabled = true; }
    assert.equal(await unpaid(h), 100);
  });
});

// ============================================================ triggers
describe("automatic trigger from QR redemption", { skip }, () => {
  async function paidOrder(userId: string, hotelId: string, amount: number) {
    const [o] = await q(
      "INSERT INTO orders (user_id, hotel_id, items, amount, status) VALUES ($1,$2,'[]',$3,'paid') RETURNING id",
      [userId, hotelId, amount]
    );
    return o.id as string;
  }

  test("redemption crossing the threshold pays automatically; repeat scan adds nothing and pays nothing", async () => {
    mock.reset();
    const s = await makeUser(); const staff = await makeUser("hotel_owner"); const h = await makeHotel();
    const orderId = await paidOrder(s.id, h, 100); // hotel share 90 (10% commission)
    const payload = m.qr.generateOrderQrPayload(orderId);
    await m.order.redeemOrderByQr(payload, h, staff.id);
    assert.ok(await waitFor(async () => (await payoutsOf(h)).length === 1), "background evaluation created a payout");
    const [p] = await payoutsOf(h);
    assert.equal(Number(p.amount), 90);
    await assert.rejects(m.order.redeemOrderByQr(payload, h, staff.id), (e: any) => e.code === "ALREADY_REDEEMED");
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("small order stays accumulated and unpaid", async () => {
    mock.reset();
    const s = await makeUser(); const staff = await makeUser("hotel_owner"); const h = await makeHotel();
    const orderId = await paidOrder(s.id, h, 30); // hotel share 27
    await m.order.redeemOrderByQr(m.qr.generateOrderQrPayload(orderId), h, staff.id);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((await payoutsOf(h)).length, 0);
    assert.equal(await unpaid(h), 27);
  });

  test("5 concurrent evaluations on a 50 balance -> one payout, one provider transfer", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [20, 30]);
    const rs = await Promise.all(Array.from({ length: 5 }, () => m.payout.evaluateAutoPayout(h)));
    assert.equal(rs.filter((r: any) => r.action === "initiated").length, 1);
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });

  test("concurrent evaluations on DIFFERENT orders crossing the threshold never share an order", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [30]);
    const adds = Array.from({ length: 4 }, async (_v, i) => { await earn(s.id, h, [5 + i]); return m.payout.evaluateAutoPayout(h); });
    await Promise.all(adds);
    const rows = await q("SELECT payout_id, count(*)::int n FROM orders WHERE hotel_id=$1 AND payout_id IS NOT NULL GROUP BY payout_id", [h]);
    const total = (await payoutsOf(h)).reduce((a: number, p: any) => a + Number(p.amount), 0);
    const claimedSum = Number((await q("SELECT COALESCE(SUM(hotel_amount),0) s FROM orders WHERE hotel_id=$1 AND payout_id IS NOT NULL", [h]))[0].s);
    assert.equal(total, claimedSum); // every paid shilling is attributable to exactly one payout
    assert.equal(mock.count("POST", "/transfer"), rows.length);
  });
});

// ============================================================ failure / recovery
describe("failure, processing and uncertain outcomes", { skip }, () => {
  test("definitive rejection preserves the entitlement; no retry loop; manual retry works", async () => {
    mock.reset();
    const s = await makeUser(); const admin = await makeUser("mealvest_admin"); const h = await makeHotel();
    await earn(s.id, h, [60]);
    mock.nextTransfer = "400";
    const r1 = await m.payout.evaluateAutoPayout(h);
    assert.equal(r1.payout.status, "failed");
    assert.ok(r1.payout.failure_reason);
    assert.equal(await unpaid(h), 60); // released, still owed
    // immediate re-evaluation: cooldown, no provider call
    const r2 = await m.payout.evaluateAutoPayout(h);
    assert.equal(r2.reason, "failure_cooldown");
    assert.equal(mock.count("POST", "/transfer"), 1);
    // cooldown elapsed -> safe automatic retry (new reference, orders were released)
    await backdate(h, "updated_at", "2 hours");
    mock.nextTransfer = "400";
    assert.equal((await m.payout.evaluateAutoPayout(h)).payout.status, "failed");
    await backdate(h, "updated_at", "2 hours");
    mock.nextTransfer = "400";
    assert.equal((await m.payout.evaluateAutoPayout(h)).payout.status, "failed");
    await backdate(h, "updated_at", "2 hours");
    // 3 consecutive failures: automatic attempts stop for good
    assert.equal((await m.payout.evaluateAutoPayout(h)).reason, "repeated_failures");
    assert.equal(mock.count("POST", "/transfer"), 3);
    assert.equal(await unpaid(h), 60);
    // an administrator can still retry deliberately; it pays 60 exactly once
    const manual = await m.payout.triggerPayout(h, admin.id);
    assert.equal(Number(manual.amount), 60);
    assert.equal(manual.status, "processing");
    assert.equal(await unpaid(h), 0);
  });

  test("timeout (response lost) -> 'unknown'; no second payout while uncertain; reconciles under the SAME reference", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [70]);
    mock.nextTransfer = "drop";
    const r = await m.payout.evaluateAutoPayout(h);
    assert.equal(r.payout.status, "unknown");
    await earn(s.id, h, [50]); // would cross the threshold again on its own
    const again = await m.payout.evaluateAutoPayout(h);
    assert.equal(again.reason, "payout_unknown");
    assert.equal(mock.count("POST", "/transfer"), 1);
    const v = await m.payout.verifyPayout(r.payout.id);
    assert.equal(v.status, "processing");
    assert.equal(mock.count("POST", "/transfer"), 1);
    mock.transfers.get(r.payout.transfer_reference)!.status = "success";
    assert.equal((await m.payout.verifyPayout(r.payout.id)).status, "successful");
    assert.equal((await m.payout.verifyPayout(r.payout.id)).status, "successful"); // repeat reconcile: stable
  });

  test("'processing' (accepted, not final) is never marked successful and its funds are never re-paid; only NEW earnings can trigger a new payout", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [60]);
    const r = await m.payout.evaluateAutoPayout(h);
    assert.equal(r.payout.status, "processing");
    await earn(s.id, h, [10]);
    assert.equal((await m.payout.evaluateAutoPayout(h)).action, "below_threshold"); // 10 only, not 70
    await earn(s.id, h, [35]);
    const r2 = await m.payout.evaluateAutoPayout(h);
    assert.equal(Number(r2.payout.amount), 45); // new funds only
    assert.equal((await payoutsOf(h)).length, 2);
    assert.equal(mock.count("POST", "/transfer"), 2);
  });

  test("provider-side final success arrives -> database shows successful and stays so", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [80]);
    const r = await m.payout.evaluateAutoPayout(h);
    mock.transfers.get(r.payout.transfer_reference)!.status = "success";
    const after = await m.payout.verifyPayout(r.payout.id);
    assert.equal(after.status, "successful");
    assert.equal(await unpaid(h), 0);
  });
});

// ============================================================ recovery by reconciliation
describe("reconciliation cron additions", { skip }, () => {
  test("a payout stuck in 'pending' (process died after claim) is sent exactly once", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [55]);
    const claimed = await m.model.claimPendingOrdersForPayout(h, `PO-stale-${crypto.randomBytes(3).toString("hex")}`, null, "paystack", { perPayoutMaxKes: 5000, dailyMaxKes: 1e6 }, 40);
    assert.equal(claimed.status, "pending");
    await backdate(h, "created_at", "10 minutes");
    await m.recon.reconcilePayouts();
    await m.recon.reconcilePayouts();
    // count only THIS payout's reference (the sweep may legitimately pay other test hotels)
    const sends = mock.requests.filter((r) => r.method === "POST" && r.path === "/transfer" && r.body.reference === claimed.transfer_reference);
    assert.equal(sends.length, 1);
    assert.notEqual((await m.model.getPayoutById(claimed.id)).status, "pending");
  });

  test("sweep pays a hotel already over the threshold that no trigger paid; running twice is harmless", async () => {
    mock.reset();
    const s = await makeUser(); const h = await makeHotel();
    await earn(s.id, h, [48]);
    await m.recon.reconcilePayouts();
    await m.recon.reconcilePayouts();
    assert.equal((await payoutsOf(h)).length, 1);
    assert.equal(mock.count("POST", "/transfer"), 1);
  });
});

// ============================================================ Cyzora webhook status tracking
describe("Cyzora payout webhook status tracking", { skip }, () => {
  test("delayed payout.paid moves processing -> successful; duplicate and late payout.failed change nothing", async () => {
    const s = await makeUser(); const h = await makeHotel();
    const p = await insertCyzoraPayout(h, s.id, "processing", 60, "po_cyz_1");
    const r1 = await m.payout.applyCyzoraPayoutWebhook("payout.paid", "po_cyz_1");
    assert.equal(r1.status, "successful");
    const r2 = await m.payout.applyCyzoraPayoutWebhook("payout.paid", "po_cyz_1");
    assert.equal(r2.status, "successful");
    const r3 = await m.payout.applyCyzoraPayoutWebhook("payout.failed", "po_cyz_1");
    assert.equal(r3.status, "successful");
    assert.equal((await q("SELECT count(*)::int n FROM orders WHERE payout_id=$1", [p.id]))[0].n, 1); // still claimed, not released
  });

  test("payout.failed releases the entitlement once; a duplicate does not release again", async () => {
    const s = await makeUser(); const h = await makeHotel();
    const p = await insertCyzoraPayout(h, s.id, "processing", 70, "po_cyz_2");
    assert.equal((await m.payout.applyCyzoraPayoutWebhook("payout.failed", "po_cyz_2")).status, "failed");
    assert.equal(await unpaid(h), 70);
    await earn(s.id, h, [5]);
    await m.payout.applyCyzoraPayoutWebhook("payout.failed", "po_cyz_2");
    assert.equal(await unpaid(h), 75);
    assert.equal((await m.model.getPayoutById(p.id)).status, "failed");
  });

  test("webhook for an 'unknown' payout that has its Cyzora id finalises it; unknown id -> null (Cyzora retries)", async () => {
    const s = await makeUser(); const h = await makeHotel();
    await insertCyzoraPayout(h, s.id, "unknown", 50, "po_cyz_3");
    assert.equal((await m.payout.applyCyzoraPayoutWebhook("payout.paid", "po_cyz_3")).status, "successful");
    assert.equal(await m.payout.applyCyzoraPayoutWebhook("payout.paid", "po_does_not_exist"), null);
  });

  test("an unrecognised payout event never changes the payout (and is logged)", async () => {
    const s = await makeUser(); const h = await makeHotel();
    const p = await insertCyzoraPayout(h, s.id, "processing", 45, "po_cyz_4");
    const r = await m.payout.applyCyzoraPayoutWebhook("payout.something_else", "po_cyz_4");
    assert.equal(r.status, "processing");
    assert.equal((await m.model.getPayoutById(p.id)).status, "processing");
  });
});

// ============================================================ admin API
describe("admin payout monitoring API", { skip }, () => {
  test("dashboard API reflects the updated status; flags automated + stuck payouts; hides from non-admins", async () => {
    const s = await makeUser(); const admin = await makeUser("mealvest_admin"); const owner = await makeUser("hotel_owner"); const h = await makeHotel();
    const p = await insertCyzoraPayout(h, s.id, "processing", 66, "po_cyz_5");
    await backdate(h, "submitted_at", "5 hours");
    await q("UPDATE hotel_payouts SET last_reconciled_at = now() WHERE id=$1", [p.id]); // cron touching the row must not hide staleness
    let list = await http_(api.base, "/api/admin/payouts", { token: admin.token });
    let row = list.data.payouts.find((x: any) => x.id === p.id);
    assert.equal(row.status, "processing");
    assert.equal(row.automated, true);
    assert.equal(row.needs_attention, true); // processing far past the stale window
    await m.payout.applyCyzoraPayoutWebhook("payout.paid", "po_cyz_5");
    list = await http_(api.base, "/api/admin/payouts", { token: admin.token });
    row = list.data.payouts.find((x: any) => x.id === p.id);
    assert.equal(row.status, "successful");
    assert.equal(row.needs_attention, false);

    const pending = await http_(api.base, "/api/admin/payouts/pending", { token: admin.token });
    assert.equal(pending.status, 200);
    assert.equal(pending.data.threshold_kes, 40);
    assert.equal(pending.data.auto_payouts_enabled, true);

    assert.equal((await http_(api.base, "/api/admin/payouts", { token: owner.token })).status, 403);
    assert.equal((await http_(api.base, "/api/admin/payouts", { token: s.token })).status, 403);
    assert.equal((await http_(api.base, "/api/admin/payouts")).status, 401);
  });

  test("accumulating hotels (below threshold) are listed with below_threshold=true", async () => {
    const s = await makeUser(); const admin = await makeUser("mealvest_admin"); const h = await makeHotel();
    await earn(s.id, h, [27]);
    const pending = await http_(api.base, "/api/admin/payouts/pending", { token: admin.token });
    const row = pending.data.hotels.find((x: any) => x.hotel_id === h);
    assert.equal(row.below_threshold, true);
    assert.equal(Number(row.pending_amount), 27);
  });
});
