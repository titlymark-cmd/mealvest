import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COMMISSION_PERCENT,
  effectiveCommissionPercent,
  effectiveCommissionSql,
  hasCommissionOverride,
  splitOrderAmount,
  isPayoutMode,
} from "../src/lib/hotelCommission";
import { payoutConfigSchema, formatPayoutTime } from "../src/schemas/payoutModeSchema";
import { registerHotelSchema } from "../src/schemas/authSchemas";
import { businessDate, businessTimeOfDay } from "../src/lib/businessTime";
import { runDailyPayouts, DailyPayoutDeps } from "../src/services/dailyPayoutService";
import { env } from "../src/config/env";

/**
 * Pure-logic tests: no database, no network, no provider. The scheduler is
 * exercised through its injected dependencies (an in-memory fake of
 * hotel_daily_payout_runs + the evaluator), so these prove the
 * scheduler's decisions, not Postgres locking — that part needs the
 * database-backed tests in tests/integration/payoutModes.int.test.ts.
 */

describe("commission defaults and overrides", () => {
  test("instant defaults to 15% and daily to 10%", () => {
    assert.equal(DEFAULT_COMMISSION_PERCENT.instant, 15);
    assert.equal(DEFAULT_COMMISSION_PERCENT.daily, 10);
    assert.equal(effectiveCommissionPercent("instant", null), 15);
    assert.equal(effectiveCommissionPercent("daily", null), 10);
  });

  test("an explicit override wins in either mode and only for that hotel's inputs", () => {
    assert.equal(effectiveCommissionPercent("instant", 12), 12);
    assert.equal(effectiveCommissionPercent("daily", "12.00"), 12);
    // hotel B (no override) is unaffected by hotel A's override
    assert.equal(effectiveCommissionPercent("daily", null), 10);
  });

  test("an override of 0 is an explicit override, not 'absent'", () => {
    assert.equal(hasCommissionOverride(0), true);
    assert.equal(hasCommissionOverride("0.00"), true);
    assert.equal(hasCommissionOverride(null), false);
    assert.equal(effectiveCommissionPercent("instant", 0), 0);
  });

  test("changing payout mode never changes an explicit override", () => {
    // The override is a separate input; mode only selects the default.
    assert.equal(effectiveCommissionPercent("instant", 12), effectiveCommissionPercent("daily", 12));
  });

  test("the SQL form is built from the same defaults", () => {
    const sql = effectiveCommissionSql("h");
    assert.match(sql, /COALESCE\(h\.commission_override_percent/);
    assert.match(sql, /WHEN 'daily' THEN 10 ELSE 15/);
  });

  test("commission is applied once and rounding matches the historical rule", () => {
    assert.deepEqual(splitOrderAmount(100, 15), { commissionAmount: 15, hotelAmount: 85 });
    assert.deepEqual(splitOrderAmount(100, 10), { commissionAmount: 10, hotelAmount: 90 });
    const r = splitOrderAmount(33.33, 15);
    assert.equal(r.commissionAmount, 5);
    assert.equal(Math.round((r.commissionAmount + r.hotelAmount) * 100) / 100, 33.33);
  });

  test("isPayoutMode", () => {
    assert.equal(isPayoutMode("instant"), true);
    assert.equal(isPayoutMode("daily"), true);
    assert.equal(isPayoutMode("weekly"), false);
  });
});

describe("payout configuration validation", () => {
  test("instant needs no time and drops any time that is sent", () => {
    assert.deepEqual(payoutConfigSchema.parse({ mode: "instant" }), { mode: "instant", payoutTime: null });
    assert.deepEqual(payoutConfigSchema.parse({ mode: "instant", payoutTime: "21:00" }), { mode: "instant", payoutTime: null });
  });
  test("daily requires a valid HH:MM time", () => {
    assert.deepEqual(payoutConfigSchema.parse({ mode: "daily", payoutTime: "21:00" }), { mode: "daily", payoutTime: "21:00" });
    for (const bad of [undefined, null, "", "9pm", "24:00", "21:60", "21:00:00", "7:5"]) {
      assert.equal(payoutConfigSchema.safeParse({ mode: "daily", payoutTime: bad }).success, false, String(bad));
    }
  });
  test("invalid modes are rejected", () => {
    assert.equal(payoutConfigSchema.safeParse({ mode: "weekly", payoutTime: "09:00" }).success, false);
    assert.equal(payoutConfigSchema.safeParse({ mode: "" }).success, false);
    assert.equal(payoutConfigSchema.safeParse({}).success, false);
  });
  test("a commission value can never be supplied through the payout config", () => {
    assert.equal(payoutConfigSchema.safeParse({ mode: "instant", commissionPercent: 0 }).success, false);
  });
  test("formatPayoutTime trims pg's HH:MM:SS", () => {
    assert.equal(formatPayoutTime("21:00:00"), "21:00");
    assert.equal(formatPayoutTime(null), null);
  });

  const base = {
    email: "owner@example.com",
    phoneNumber: "0712345678",
    password: "Password123!",
    pin: "1234",
    hotelName: "Test Hotel",
    businessType: "hotel",
    contactFullName: "Owner Name",
    settlement: { method: "send_money", phoneNumber: "0712345678", accountHolderName: "Owner Name" },
  };
  test("registration: payout is optional (older clients) and validated when present", () => {
    const old = registerHotelSchema.safeParse(base);
    assert.equal(old.success, true, JSON.stringify((old as any).error?.errors));
    assert.equal((old as any).data.payout, undefined);
    assert.equal(registerHotelSchema.safeParse({ ...base, payout: { mode: "daily", payoutTime: "21:00" } }).success, true);
    assert.equal(registerHotelSchema.safeParse({ ...base, payout: { mode: "daily" } }).success, false);
    assert.equal(registerHotelSchema.safeParse({ ...base, payout: { mode: "instant", commissionPercent: 1 } }).success, false);
  });
});

describe("business time", () => {
  test("Africa/Nairobi is UTC+3: 18:00Z is 21:00 the same day, 21:30Z is 00:30 next day", () => {
    assert.equal(businessTimeOfDay(new Date("2026-10-24T18:00:00Z"), "Africa/Nairobi"), "21:00");
    assert.equal(businessDate(new Date("2026-10-24T18:00:00Z"), "Africa/Nairobi"), "2026-10-24");
    assert.equal(businessTimeOfDay(new Date("2026-10-24T21:30:00Z"), "Africa/Nairobi"), "00:30");
    assert.equal(businessDate(new Date("2026-10-24T21:30:00Z"), "Africa/Nairobi"), "2026-10-25");
  });
});

// ---------------------------------------------------------------------------
// Scheduler decisions with in-memory fakes
// ---------------------------------------------------------------------------
type Hotel = { id: string; time: string; mode: "daily" | "instant"; balance: number };
type Run = { id: string; status: string; attempts: number; updatedAt: number; claimedUntil: number | null };

function makeWorld(hotels: Hotel[], opts: { evaluate?: (h: Hotel) => Promise<any> } = {}) {
  const runs = new Map<string, Run>();
  const payouts: { hotelId: string; amount: number }[] = [];
  const evaluated: string[] = [];
  let clock = Date.parse("2026-10-24T18:00:00Z"); // 21:00 Nairobi
  const key = (h: string, d: string) => `${h}|${d}`;

  const deps: DailyPayoutDeps = {
    listDue: async (date, time) =>
      hotels
        .filter((h) => h.mode === "daily" && h.time <= time)
        .filter((h) => {
          const r = runs.get(key(h.id, date));
          return !r || ["claimed", "skipped", "error"].includes(r.status);
        })
        .map((h) => ({ hotel_id: h.id, payout_time: h.time + ":00" })),
    claimRun: async (hotelId, date, _t, o) => {
      const k = key(hotelId, date);
      const r = runs.get(k);
      if (!r) {
        runs.set(k, { id: k, status: "claimed", attempts: 1, updatedAt: clock, claimedUntil: clock + o.leaseMinutes * 60000 });
        return { id: k, hotel_id: hotelId, run_date: date, attempts: 1 };
      }
      const ok =
        r.attempts < o.maxAttempts &&
        ((r.status === "claimed" && r.claimedUntil! < clock) || (["skipped", "error"].includes(r.status) && r.updatedAt < clock - o.retryAfterMinutes * 60000));
      if (!ok) return null;
      r.status = "claimed";
      r.attempts++;
      r.claimedUntil = clock + o.leaseMinutes * 60000;
      return { id: k, hotel_id: hotelId, run_date: date, attempts: r.attempts };
    },
    finishRun: async (id, status) => {
      const r = [...runs.values()].find((x) => x.id === id)!;
      r.status = status;
      r.updatedAt = clock;
      r.claimedUntil = null;
    },
    evaluate:
      opts.evaluate
        ? async (hotelId) => opts.evaluate!(hotels.find((h) => h.id === hotelId)!)
        : async (hotelId) => {
            const h = hotels.find((x) => x.id === hotelId)!;
            evaluated.push(hotelId);
            if (h.balance < 40) return { action: "below_threshold", balance: h.balance.toFixed(2), threshold: 40 };
            payouts.push({ hotelId, amount: h.balance });
            const amount = h.balance;
            h.balance = 0; // reserved
            return { action: "initiated", payout: { id: "p-" + hotelId, status: "processing", amount: String(amount) } };
          },
  };
  return { deps, runs, payouts, evaluated, advance: (ms: number) => (clock += ms), now: () => new Date(clock) };
}

describe("daily payout scheduler", () => {
  const enable = () => {
    (env as any).autoPayoutsEnabled = true;
  };

  test("does nothing and records nothing when automated payouts are disabled", async () => {
    (env as any).autoPayoutsEnabled = false;
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 115 }]);
    const s = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(s.enabled, false);
    assert.equal(w.payouts.length, 0);
    assert.equal(w.runs.size, 0);
  });

  test("before the configured time nothing is due; at the time ONE payout carries the whole balance", async () => {
    enable();
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 115 }]);
    const early = await runDailyPayouts({ now: new Date("2026-10-24T17:59:00Z"), deps: w.deps }); // 20:59
    assert.equal(early.due, 0);
    assert.equal(w.payouts.length, 0);
    const at = await runDailyPayouts({ now: w.now(), deps: w.deps }); // 21:00
    assert.equal(at.initiated, 1);
    assert.deepEqual(w.payouts, [{ hotelId: "A", amount: 115 }]);
  });

  test("running the job twice (or concurrently) does not pay twice", async () => {
    enable();
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 115 }]);
    await runDailyPayouts({ now: w.now(), deps: w.deps });
    const again = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(again.due, 0);
    assert.equal(w.payouts.length, 1);

    const w2 = makeWorld([{ id: "B", time: "21:00", mode: "daily", balance: 90 }]);
    const [r1, r2] = await Promise.all([runDailyPayouts({ now: w2.now(), deps: w2.deps }), runDailyPayouts({ now: w2.now(), deps: w2.deps })]);
    assert.equal(r1.claimed + r2.claimed, 1);
    assert.equal(w2.payouts.length, 1);
  });

  test("below KSh 40 carries forward, stays daily, and is re-evaluated the NEXT day only", async () => {
    enable();
    const hotel: Hotel = { id: "A", time: "21:00", mode: "daily", balance: 35 };
    const w = makeWorld([hotel]);
    const day1 = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(day1.belowThreshold, 1);
    assert.equal(w.payouts.length, 0);
    assert.equal(hotel.mode, "daily");
    hotel.balance += 10; // reaches 45 later the same evening — must NOT pay instantly
    const sameDay = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(sameDay.due, 0);
    assert.equal(w.payouts.length, 0);
    const day2 = await runDailyPayouts({ now: new Date("2026-10-25T18:00:00Z"), deps: w.deps });
    assert.equal(day2.initiated, 1);
    assert.deepEqual(w.payouts, [{ hotelId: "A", amount: 45 }]);
  });

  test("hotels with different times are evaluated independently", async () => {
    enable();
    const w = makeWorld([
      { id: "early", time: "09:00", mode: "daily", balance: 60 },
      { id: "late", time: "23:30", mode: "daily", balance: 70 },
      { id: "instant", time: "09:00", mode: "instant", balance: 500 },
    ]);
    const s = await runDailyPayouts({ now: w.now(), deps: w.deps }); // 21:00
    assert.deepEqual(w.payouts, [{ hotelId: "early", amount: 60 }]);
    assert.equal(s.due, 1);
    const later = await runDailyPayouts({ now: new Date("2026-10-24T20:30:00Z"), deps: w.deps }); // 23:30
    assert.equal(later.initiated, 1);
    assert.deepEqual(w.payouts.map((p) => p.hotelId), ["early", "late"]);
  });

  test("one hotel throwing does not stop the others, and is retried (bounded) later", async () => {
    enable();
    let boom = true;
    const hotels: Hotel[] = [
      { id: "bad", time: "08:00", mode: "daily", balance: 80 },
      { id: "good", time: "09:00", mode: "daily", balance: 80 },
    ];
    const w = makeWorld(hotels, {
      evaluate: async (h) => {
        if (h.id === "bad" && boom) throw new Error("provider exploded");
        return { action: "initiated", payout: { id: "p-" + h.id, status: "processing", amount: "80" } };
      },
    });
    const s = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(s.errors, 1);
    assert.equal(s.initiated, 1);
    // immediately re-running does not hammer the failing hotel (retry spacing)
    const tooSoon = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(tooSoon.claimed, 0);
    boom = false;
    w.advance(16 * 60000);
    const retry = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(retry.initiated, 1);
  });

  test("a skipped hotel (e.g. unresolved payout) is retried, but never beyond the attempt cap", async () => {
    enable();
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 80 }], {
      evaluate: async () => ({ action: "skipped", reason: "payout_unknown" }),
    });
    let attempts = 0;
    for (let i = 0; i < 10; i++) {
      const s = await runDailyPayouts({ now: w.now(), deps: w.deps });
      attempts += s.claimed;
      w.advance(16 * 60000);
    }
    assert.equal(attempts, 4);
    assert.equal(w.payouts.length, 0);
  });

  test("a crashed run's lease expires and the hotel is picked up again", async () => {
    enable();
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 80 }]);
    // simulate a claim by a process that died before finishing
    await w.deps.claimRun("A", "2026-10-24", "21:00:00", { maxAttempts: 4, retryAfterMinutes: 15, leaseMinutes: 10 });
    const during = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(during.claimed, 0);
    w.advance(11 * 60000);
    const after = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(after.initiated, 1);
  });

  test("a mode change between listing and evaluation is settled without paying", async () => {
    enable();
    const w = makeWorld([{ id: "A", time: "21:00", mode: "daily", balance: 80 }], {
      evaluate: async () => ({ action: "skipped", reason: "not_daily_mode" }),
    });
    const s = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(s.nothing, 1);
    assert.equal(w.payouts.length, 0);
    const again = await runDailyPayouts({ now: w.now(), deps: w.deps });
    assert.equal(again.due, 0);
  });
});
