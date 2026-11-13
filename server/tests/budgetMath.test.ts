/**
 * Pure (no database) tests for the Stage 1 budget model: exact money helpers,
 * the fixed daily allowance, the available/free formulas and the additive
 * carry-forward rollover. The SQL spend/hold/settle paths are covered by
 * tests/integration/budget.int.test.ts (needs TEST_DATABASE_URL).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { toCents, centsToStr, centsToNumber } from "../src/lib/money";
import { computeAvailability, computeDailyAllowance, computeRollover } from "../src/services/budgetService";

const DAY1 = "2026-11-01";
const day = (n: number) => `2026-11-${String(1 + n).padStart(2, "0")}`;

/** A budget row fragment; amounts are NUMERIC strings exactly as pg returns them. */
function row(o: Partial<Record<string, string | null>> = {}) {
  return {
    daily_allowance: "1000.00",
    banked_amount: "0.00",
    spent_today: "0.00",
    reserved_amount: "0.00",
    remaining_amount: "3000.00",
    pending_tomorrow_amount: "0.00",
    pending_rollover_amount: "0.00",
    last_spend_date: DAY1,
    start_date: DAY1,
    ...o,
  } as {
    daily_allowance: string; banked_amount: string; spent_today: string; reserved_amount: string; remaining_amount: string;
    pending_tomorrow_amount: string; pending_rollover_amount: string; last_spend_date: string | null; start_date: string;
  };
}

describe("exact money helpers", () => {
  test("0.1 + 0.2 is exactly 0.30 in cents", () => {
    assert.equal(toCents("0.10") + toCents("0.20"), 30);
    assert.equal(centsToStr(30), "0.30");
  });
  test("round trip and formatting", () => {
    assert.equal(centsToStr(toCents("1234.50")), "1234.50");
    assert.equal(centsToStr(5), "0.05");
    assert.equal(centsToNumber(150), 1.5);
    assert.throws(() => centsToStr(1.5));
    assert.throws(() => toCents("abc"));
  });
});

describe("fixed daily allowance (funded amount / plan days)", () => {
  test("3000 over 3 days is 1000", () => assert.equal(computeDailyAllowance(3000, 3), 1000));
  test("floors to the cent so allowance x days never exceeds the funded amount", () => {
    assert.equal(computeDailyAllowance(1000, 3), 333.33);
    assert.equal(computeDailyAllowance(200, 3), 66.66); // 66.67 x 3 would be 200.01 > 200
    for (const [amt, days] of [[500, 7], [1234.56, 9], [50000, 90], [999.99, 13]] as const) {
      assert.ok(toCents(computeDailyAllowance(amt, days)) * days <= toCents(amt));
    }
  });
});

describe("available today / free plan balance", () => {
  test("available = allowance + carried - spent - reserved; free = remaining - reserved", () => {
    const a = computeAvailability(row({ banked_amount: "500.00", spent_today: "300.00", reserved_amount: "100.00", remaining_amount: "2700.00" }));
    assert.equal(a.availableToday, toCents("1100")); // 1000 + 500 - 300 - 100
    assert.equal(a.freePlan, toCents("2600"));
  });
  test("never negative", () => {
    const a = computeAvailability(row({ spent_today: "1500.00", reserved_amount: "100.00" }));
    assert.equal(a.availableToday, 0);
  });
  test("clamped to the free plan balance so the UI can't promise money the plan lacks", () => {
    const a = computeAvailability(row({ banked_amount: "5000.00", remaining_amount: "400.00" }));
    assert.equal(a.availableToday, toCents("400"));
  });
});

describe("additive carry-forward rollover", () => {
  test("rollover does not run twice on the same day (idempotent)", () => {
    const r = computeRollover(row({ last_spend_date: day(1), banked_amount: "500.00", spent_today: "200.00" }), day(1));
    assert.equal(r.changed, false);
    assert.equal(r.bankedCents, toCents("500"));
  });

  test("approved example: 3000/3 days — carry 500 -> 250 -> 250 (and remaining 250 at the end)", () => {
    // Day 1: spent 500 of 1000. Moving to day 2.
    let r = computeRollover(row({ spent_today: "500.00", last_spend_date: day(0) }), day(1));
    assert.equal(r.bankedCents, toCents("500"));
    // Day 2: available 1500, spent 1250. Moving to day 3.
    r = computeRollover(row({ banked_amount: "500.00", spent_today: "1250.00", last_spend_date: day(1), remaining_amount: "1250.00" }), day(2));
    assert.equal(r.bankedCents, toCents("250"));
    // Day 3: available 1250, spent 1000 -> 250 left, which is remaining_amount.
    const a = computeAvailability(row({ banked_amount: "250.00", spent_today: "1000.00", remaining_amount: "250.00" }));
    assert.equal(a.availableToday, toCents("250"));
  });

  test("allowance is NOT recalculated: carry never flows back into a re-divided allowance", () => {
    // Under the old model day 2 allowance would have been 3000/2 = 1500. Now the stored fixed value is used as-is.
    const r = computeRollover(row({ spent_today: "0.00", last_spend_date: day(0) }), day(1));
    const a = computeAvailability(row({ banked_amount: centsToStr(r.bankedCents) }));
    assert.equal(a.allowance, toCents("1000"));
    assert.equal(a.availableToday, toCents("2000")); // 1000 fixed + 1000 carried (additive), not 1500 + 1000
  });

  test("overspending the day's allowance consumes carry once: 1000 + 500 carried, spend 700/300/200 -> 300 left", () => {
    // banked_amount is NOT touched by spending; only spent_today grows.
    const a = computeAvailability(row({ banked_amount: "500.00", spent_today: "1200.00", remaining_amount: "1800.00" }));
    assert.equal(a.availableToday, toCents("300"));
    assert.equal(a.carried, toCents("500"));
  });

  test("spending above the allowance carries nothing forward (carry cannot go negative)", () => {
    const r = computeRollover(row({ banked_amount: "500.00", spent_today: "1500.00", last_spend_date: day(0), remaining_amount: "1500.00" }), day(1));
    assert.equal(r.bankedCents, 0);
  });

  test("untouched days each add one full allowance", () => {
    // last active day (day 0): spent 0. Then 2 fully skipped days (day 1, 2). Today = day 3.
    const r = computeRollover(row({ spent_today: "0.00", last_spend_date: day(0), remaining_amount: "3000.00" }), day(3));
    assert.equal(r.bankedCents, toCents("3000")); // 1000 (day 0 unused) + 2 x 1000 skipped
  });

  test("a plan never touched since funding uses start_date as its baseline", () => {
    const r = computeRollover(row({ last_spend_date: null, start_date: day(0), remaining_amount: "3000.00" }), day(2));
    assert.equal(r.bankedCents, toCents("2000")); // day 0 unused (1000) + 1 fully skipped day (1000); today (day 2) is added at read time
  });

  test("first touch on the start day just records the date and carries nothing", () => {
    const r = computeRollover(row({ last_spend_date: null, start_date: day(0) }), day(0));
    assert.equal(r.changed, true);
    assert.equal(r.dayAdvanced, false);
    assert.equal(r.bankedCents, 0);
  });

  test("carry is capped at what the plan actually has left", () => {
    const r = computeRollover(row({ spent_today: "0.00", last_spend_date: day(0), remaining_amount: "300.00" }), day(3));
    assert.equal(r.bankedCents, toCents("300"));
  });

  test("an open hold is not spent: it stays in the carry and is subtracted from available (never double-counted)", () => {
    // Day 0: spent 400, hold 100 outstanding.
    const r = computeRollover(row({ spent_today: "400.00", reserved_amount: "100.00", last_spend_date: day(0), remaining_amount: "2600.00" }), day(1));
    assert.equal(r.bankedCents, toCents("600")); // 1000 - 400 spent (hold is NOT spent)
    const a = computeAvailability(row({ banked_amount: "600.00", spent_today: "0.00", reserved_amount: "100.00", remaining_amount: "2600.00" }));
    assert.equal(a.availableToday, toCents("1500")); // 1000 + 600 - 100
  });

  describe("legacy rows (retired pending_* fields)", () => {
    test("old 'move to tomorrow' state carries exactly the parked amount — no double count", () => {
      // Legacy transfer on day 0: allowance 1000, carried 500 -> spent_today forced to 1500, pending_tomorrow 1500.
      const r = computeRollover(
        row({ banked_amount: "500.00", spent_today: "1500.00", pending_tomorrow_amount: "1500.00", last_spend_date: day(0), remaining_amount: "3000.00" }),
        day(1)
      );
      assert.equal(r.bankedCents, toCents("1500")); // NOT 500 + 1500
    });
    test("pending_rollover is folded into carry-forward once and zeroed", () => {
      const r = computeRollover(row({ banked_amount: "100.00", pending_rollover_amount: "250.00", last_spend_date: day(1), remaining_amount: "3000.00" }), day(1));
      assert.equal(r.changed, true);
      assert.equal(r.dayAdvanced, false);
      assert.equal(r.bankedCents, toCents("350"));
      // after the fold the row has pending 0 -> a second call is a no-op
      const again = computeRollover(row({ banked_amount: "350.00", pending_rollover_amount: "0.00", last_spend_date: day(1), remaining_amount: "3000.00" }), day(1));
      assert.equal(again.changed, false);
    });
  });
});
