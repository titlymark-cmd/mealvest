import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

export interface BudgetRow {
  id: string;
  user_id: string;
  hotel_id: string | null;
  total_amount: string;
  remaining_amount: string;
  amount_spent: string;
  daily_allowance: string;
  number_of_days: number;
  start_date: string;
  end_date: string;
  status: "active" | "completed" | "suspended" | "cancelled";
  spent_today: string;
  last_spend_date: string | null;
  banked_amount: string;
  pending_tomorrow_amount: string;
  created_at: string;
  updated_at: string;
}

/**
 * The rule carried over from the original MEALVEST budget spec: daily
 * allowance is always (remaining money) / (remaining days), computed
 * server-side. The client only ever supplies the starting inputs
 * (total amount, number of days) — it never gets to say what the
 * daily figure is, here or on any later recalculation.
 */
function computeDailyAllowance(remainingAmount: number, remainingDays: number): number {
  const safeDays = Math.max(1, remainingDays);
  return Math.round((remainingAmount / safeDays) * 100) / 100;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const TERMS_VERSION = "2026-01-mealvest-payment-terms-v1";

export async function createBudget(params: {
  userId: string;
  totalAmount?: number;
  numberOfDays?: number;
  hotelId?: string | null;
  planId?: string | null;
  termsAccepted?: boolean;
}): Promise<BudgetRow> {
  // Backend-authoritative — a malicious client calling this endpoint
  // directly (skipping the disclaimer screen entirely) is rejected
  // here regardless of what the frontend did or didn't show. This is
  // the check that actually matters; the UI checkbox is just what
  // makes a legitimate student's "yes" easy to give.
  if (params.termsAccepted !== true) {
    throw new ApiError(
      400,
      "TERMS_NOT_ACCEPTED",
      "You must accept the Mealvest payment terms before starting a plan."
    );
  }

  let totalAmount = params.totalAmount;
  let numberOfDays = params.numberOfDays;

  // If a planId is given, it is the ONLY source of truth for price
  // and duration — even if the client also sent totalAmount/
  // numberOfDays, those are ignored in favor of what's actually in
  // the plans table. This is what makes plan selection safe: a
  // student can say "I want Hustler Plan", never "I want to pay
  // KSh 1" while claiming the Hustler Plan's allocation.
  if (params.planId) {
    const planResult = await pool.query(
      "SELECT price, duration_days FROM plans WHERE id = $1 AND status = 'active'",
      [params.planId]
    );
    if (planResult.rows.length === 0) {
      throw new ApiError(404, "PLAN_NOT_FOUND", "This meal plan is not available.");
    }
    totalAmount = Number(planResult.rows[0].price);
    numberOfDays = planResult.rows[0].duration_days;
  }

  if (!totalAmount || totalAmount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Budget amount must be greater than zero.");
  }
  if (!numberOfDays || numberOfDays <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Plan length must be at least 1 day.");
  }

  const existing = await pool.query(
    "SELECT id FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1",
    [params.userId]
  );
  if (existing.rows.length > 0) {
    throw new ApiError(409, "ACTIVE_BUDGET_EXISTS", "You already have an active meal plan.");
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + numberOfDays * 24 * 60 * 60 * 1000);
  const dailyAllowance = computeDailyAllowance(totalAmount, numberOfDays);

  const result = await pool.query<BudgetRow>(
    `INSERT INTO budgets
       (user_id, hotel_id, plan_id, total_amount, remaining_amount, amount_spent, daily_allowance, number_of_days, start_date, end_date, status, terms_accepted_at, terms_version)
     VALUES ($1, $2, $3, $4, $4, 0, $5, $6, $7, $8, 'active', now(), $9)
     RETURNING *`,
    [
      params.userId,
      params.hotelId ?? null,
      params.planId ?? null,
      totalAmount,
      dailyAllowance,
      numberOfDays,
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
      TERMS_VERSION,
    ]
  );

  return result.rows[0];
}

/**
 * Fetches the student's active budget with dailyAllowance freshly
 * recalculated from remaining_amount / remaining days — this is what
 * every "get my budget" read should call, so the client always sees
 * a server-derived number, not a stale stored one, even though we
 * also persist it for convenience.
 */
export async function getActiveBudget(userId: string): Promise<(BudgetRow & { remainingDays: number }) | null> {
  const client = await pool.connect();
  let budget: BudgetRow;
  try {
    await client.query("BEGIN");
    const result = await client.query<BudgetRow>(
      "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
      [userId]
    );
    if (!result.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    // Catching up rollover on every read (not just on spend) means
    // the student's dashboard shows an accurate "carried over" figure
    // the moment they open the app on a new day, even before they've
    // ordered anything that day.
    budget = await applyDailyRollover(client, result.rows[0]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const remainingDays = daysBetween(new Date(), new Date(budget.end_date));
  const freshAllowance = computeDailyAllowance(Number(budget.remaining_amount), remainingDays);

  if (freshAllowance !== Number(budget.daily_allowance)) {
    await pool.query("UPDATE budgets SET daily_allowance = $1 WHERE id = $2", [freshAllowance, budget.id]);
    budget.daily_allowance = String(freshAllowance);
  }

  return { ...budget, remainingDays };
}

/**
 * Atomically deducts `amount` from the caller's active budget — this
 * is what a paid meal order actually does to a student's plan.
 * SELECT...FOR UPDATE locks the budget row so two near-simultaneous
 * orders can never both read the same remaining_amount and both
 * succeed when only one should.
 */
/**
 * Rolls forward any unused daily allowance into `banked_amount`,
 * lazily — there's no cron job "closing out the day" at midnight;
 * instead, whenever the budget is touched (read or spent against),
 * this catches it up to the current date first. This is what makes
 * it safe against clock games: the server's own CURRENT_DATE is the
 * only clock that matters, never anything the client sends.
 *
 * Handles gaps of more than one day correctly (e.g. a student who
 * doesn't open the app for 3 days doesn't lose that rollover — each
 * fully-skipped day's ENTIRE daily_allowance banks, not just the
 * most recent day's leftover).
 *
 * Must be called with a client already inside a transaction that has
 * the budget row locked (SELECT...FOR UPDATE) — this function itself
 * doesn't lock, it assumes the caller already did.
 */
async function applyDailyRollover(client: import("pg").PoolClient, budget: BudgetRow): Promise<BudgetRow> {
  const todayResult = await client.query("SELECT CURRENT_DATE AS today");
  const today: string = todayResult.rows[0].today.toISOString().slice(0, 10);

  if (budget.last_spend_date === today) {
    return budget; // Already caught up — the common case, no write needed.
  }

  const dailyAllowance = Number(budget.daily_allowance);
  let banked = Number(budget.banked_amount);

  if (budget.last_spend_date === null) {
    // First-ever spend on this budget — nothing to roll over yet,
    // just start tracking from today.
  } else {
    const daysElapsed = Math.max(
      1,
      Math.round(
        (new Date(today).getTime() - new Date(budget.last_spend_date).getTime()) / (24 * 60 * 60 * 1000)
      )
    );
    const unusedFromLastActiveDay = Math.max(0, dailyAllowance - Number(budget.spent_today));
    const fullySkippedDays = daysElapsed - 1;
    banked = Math.round((banked + unusedFromLastActiveDay + fullySkippedDays * dailyAllowance) * 100) / 100;
  }

  // A day has genuinely passed — this is the ONE moment any manually
  // transferred amount (via transferRemainingToNextDay) actually
  // becomes spendable. Before this point, pending_tomorrow_amount is
  // deliberately excluded from every "available today" calculation.
  const pendingTomorrow = Number(budget.pending_tomorrow_amount);
  banked = Math.round((banked + pendingTomorrow) * 100) / 100;

  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET spent_today = 0, last_spend_date = $1, banked_amount = $2, pending_tomorrow_amount = 0, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [today, banked, budget.id]
  );
  return updated.rows[0];
}

/**
 * The manual "transfer remaining to next day" action — a student
 * tapping "Available today" and confirming. Unlike the automatic
 * rollover, this happens mid-day, at the student's request, and the
 * whole point is that the money stops being spendable RIGHT NOW, not
 * at the next real day boundary. So it goes into
 * pending_tomorrow_amount (invisible to today's spendable total),
 * and `spent_today` is set to fully consume today's allowance —
 * `spent_today` already means "no longer available today" regardless
 * of whether that's because it was spent on a meal or given away, so
 * this is consistent with what that field already represents
 * elsewhere in this file.
 */
export async function transferRemainingToNextDay(userId: string): Promise<BudgetRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<BudgetRow>(
      "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
      [userId]
    );
    let budget = result.rows[0];
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan.");
    }
    budget = await applyDailyRollover(client, budget);

    const spendableToday =
      Math.round((Number(budget.daily_allowance) + Number(budget.banked_amount) - Number(budget.spent_today)) * 100) / 100;

    if (spendableToday <= 0) {
      throw new ApiError(400, "NOTHING_TO_TRANSFER", "There's nothing left today to transfer.");
    }

    const newSpentToday = Math.round((Number(budget.daily_allowance) + Number(budget.banked_amount)) * 100) / 100;
    const newPendingTomorrow = Math.round((Number(budget.pending_tomorrow_amount) + spendableToday) * 100) / 100;

    const updated = await client.query<BudgetRow>(
      `UPDATE budgets SET spent_today = $1, pending_tomorrow_amount = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [newSpentToday, newPendingTomorrow, budget.id]
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function deductFromBudget(userId: string, amount: number): Promise<BudgetRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<BudgetRow>(
      "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
      [userId]
    );
    let budget = result.rows[0];
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan.");
    }

    budget = await applyDailyRollover(client, budget);

    // Two independent caps, both must pass: today's spendable amount
    // (daily_allowance + whatever rolled in from past days), AND the
    // budget's total remaining_amount — the daily cap alone can't
    // let someone overspend the whole plan just because a lot rolled
    // over, and the total cap alone can't let someone blow the whole
    // plan in one day the way the old code allowed.
    const spendableToday =
      Math.round((Number(budget.daily_allowance) + Number(budget.banked_amount) - Number(budget.spent_today)) * 100) / 100;

    if (amount > spendableToday) {
      throw new ApiError(
        402,
        "DAILY_LIMIT_EXCEEDED",
        `This order costs more than today's available balance (${spendableToday} left today, including any rolled-over amount).`
      );
    }
    if (Number(budget.remaining_amount) < amount) {
      throw new ApiError(402, "INSUFFICIENT_BALANCE", "This order costs more than your remaining plan balance.");
    }

    const newRemaining = Math.round((Number(budget.remaining_amount) - amount) * 100) / 100;
    const newSpent = Math.round((Number(budget.amount_spent) + amount) * 100) / 100;
    const newSpentToday = Math.round((Number(budget.spent_today) + amount) * 100) / 100;
    // If today's spend eats into the banked rollover (not just
    // today's own allowance), draw it down accordingly, so it can't
    // be double-counted as still-available tomorrow.
    const bankedUsedToday = Math.max(0, newSpentToday - Number(budget.daily_allowance));
    const newBanked = Math.round((Number(budget.banked_amount) - bankedUsedToday) * 100) / 100;

    const updated = await client.query<BudgetRow>(
      `UPDATE budgets SET remaining_amount = $1, amount_spent = $2, spent_today = $3, banked_amount = $4, updated_at = now()
       WHERE id = $5 RETURNING *`,
      [newRemaining, newSpent, newSpentToday, Math.max(0, newBanked), budget.id]
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Meal Boost — adds money to an ALREADY ACTIVE budget, paid for via
 * its own Paystack transaction (see paymentService.activatePaymentIfNeeded,
 * type='plan_boost'). Deliberately minimal: only total_amount and
 * remaining_amount move. daily_allowance is NOT recomputed here —
 * getActiveBudget already recalculates it fresh on every read
 * (remaining_amount / remainingDays), so the next time the student's
 * dashboard loads, the boosted amount is already reflected in a
 * higher daily rate without this function needing to duplicate that
 * logic. Today's already-spent/banked/pending-tomorrow figures are
 * untouched — a boost adds to what's left for the rest of the plan,
 * it doesn't rewrite today.
 */
export async function applyBoost(budgetId: string, amount: number): Promise<BudgetRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<BudgetRow>(
      "SELECT * FROM budgets WHERE id = $1 AND status = 'active' FOR UPDATE",
      [budgetId]
    );
    const budget = result.rows[0];
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "This meal plan is no longer active.");
    }

    const newTotal = Math.round((Number(budget.total_amount) + amount) * 100) / 100;
    const newRemaining = Math.round((Number(budget.remaining_amount) + amount) * 100) / 100;

    const updated = await client.query<BudgetRow>(
      `UPDATE budgets SET total_amount = $1, remaining_amount = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [newTotal, newRemaining, budgetId]
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Savings withdrawal — locked until the budget's contract period has
 * actually ended, checked server-side against the DB's own
 * CURRENT_DATE, never a client-supplied date. The student receives
 * their FULL remaining balance; any hotel loyalty incentive is a
 * separate, additive, platform-funded figure recorded alongside the
 * withdrawal — never subtracted. Migration 020's
 * chk_student_gets_full_savings constraint makes this invariant
 * impossible to violate even by a future bug.
 */
export async function withdrawSavings(params: {
  userId: string;
  payoutMethod: "mpesa" | "bank";
  payoutDestination: string;
}): Promise<{
  gross_savings: number;
  student_amount: number;
  hotel_incentive_amount: number;
  status: string;
  withdrawalId: string;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const budgetResult = await client.query<BudgetRow>(
      "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
      [params.userId]
    );
    const budget = budgetResult.rows[0];
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan to withdraw from.");
    }

    const endDateResult = await client.query("SELECT (end_date <= CURRENT_DATE) AS ended FROM budgets WHERE id = $1", [
      budget.id,
    ]);
    if (!endDateResult.rows[0].ended) {
      throw new ApiError(
        403,
        "CONTRACT_ACTIVE",
        "Withdrawal becomes available after your Mealvest contract period ends."
      );
    }

    const existing = await client.query("SELECT id FROM savings_withdrawals WHERE budget_id = $1", [budget.id]);
    if (existing.rows.length > 0) {
      throw new ApiError(409, "ALREADY_WITHDRAWN", "This plan's savings have already been withdrawn.");
    }

    const grossSavings = Number(budget.remaining_amount);

    let hotelId: string | null = null;
    let incentivePercent = 0;
    if (budget.hotel_id) {
      const hotelResult = await client.query("SELECT id, loyalty_incentive_percent FROM hotels WHERE id = $1", [
        budget.hotel_id,
      ]);
      if (hotelResult.rows.length > 0) {
        hotelId = hotelResult.rows[0].id;
        incentivePercent = Number(hotelResult.rows[0].loyalty_incentive_percent);
      }
    }
    const hotelIncentiveAmount = Math.round(grossSavings * (incentivePercent / 100) * 100) / 100;

    const withdrawal = await client.query(
      `INSERT INTO savings_withdrawals
         (user_id, budget_id, hotel_id, gross_savings, student_amount, hotel_incentive_amount, payout_method, payout_destination, status)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [params.userId, budget.id, hotelId, grossSavings, hotelIncentiveAmount, params.payoutMethod, params.payoutDestination]
    );

    await client.query("UPDATE budgets SET status = 'completed', remaining_amount = 0, updated_at = now() WHERE id = $1", [
      budget.id,
    ]);

    await client.query("COMMIT");

    return {
      gross_savings: grossSavings,
      student_amount: grossSavings,
      hotel_incentive_amount: hotelIncentiveAmount,
      status: "pending",
      withdrawalId: withdrawal.rows[0].id,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
