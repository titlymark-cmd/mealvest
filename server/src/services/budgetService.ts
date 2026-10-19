import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import * as notificationEvents from "./notificationEvents";
import { businessDate, dateOnly, daysBetweenDates, addDays } from "../lib/businessTime";

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
  pending_rollover_amount: string;
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

/** Days left in the plan, counted in business-timezone calendar days (minimum 1). */
function remainingDaysFor(endDate: string | Date): number {
  const end = dateOnly(endDate as string | Date)!;
  return Math.max(1, daysBetweenDates(businessDate(), end));
}

export const TERMS_VERSION = "2026-01-mealvest-payment-terms-v1";

type DbClient = import("pg").PoolClient;

/**
 * Creates a student's budget from a VERIFIED, successful budget_topup
 * transaction (security finding C1). This is the ONLY way a budget can
 * come into existence: there is no client-callable path any more, and
 * migration 043's trigger independently rejects any INSERT whose
 * funding_transaction_id is missing, not owned by the user, not a
 * budget_topup, not 'success', or already used by another budget.
 *
 * Must be called with `client` already inside a transaction (the
 * payment-activation transaction) so the payment's status flip, the
 * budget insert and the activation marker commit or roll back together.
 *
 * Amount and length come from the transaction row the server created
 * at initialize time and the provider confirmed — never from a request
 * body. Terms acceptance was required (z.literal(true)) at initialize.
 */
export async function createFundedBudget(
  client: DbClient,
  params: {
    userId: string;
    fundingTransactionId: string;
    totalAmount: number;
    numberOfDays: number;
    hotelId?: string | null;
  }
): Promise<BudgetRow> {
  const { totalAmount, numberOfDays } = params;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Budget amount must be greater than zero.");
  }
  if (!Number.isInteger(numberOfDays) || numberOfDays <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Plan length must be at least 1 day.");
  }

  const startDate = businessDate();
  const endDate = addDays(startDate, numberOfDays);
  const dailyAllowance = computeDailyAllowance(totalAmount, numberOfDays);

  const result = await client.query<BudgetRow>(
    `INSERT INTO budgets
       (user_id, hotel_id, total_amount, remaining_amount, amount_spent, daily_allowance, number_of_days,
        start_date, end_date, status, terms_accepted_at, terms_version, funding_transaction_id)
     VALUES ($1, $2, $3, $3, 0, $4, $5, $6, $7, 'active', now(), $8, $9)
     RETURNING *`,
    [
      params.userId,
      params.hotelId ?? null,
      totalAmount,
      dailyAllowance,
      numberOfDays,
      startDate,
      endDate,
      TERMS_VERSION,
      params.fundingTransactionId,
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

    // Recalculated and persisted while the row is still locked, so it
    // can never overwrite a concurrent deduction's view of the budget.
    const remainingDaysNow = remainingDaysFor(budget.end_date);
    const freshAllowance = computeDailyAllowance(Number(budget.remaining_amount), remainingDaysNow);
    if (freshAllowance !== Number(budget.daily_allowance)) {
      await client.query("UPDATE budgets SET daily_allowance = $1 WHERE id = $2", [freshAllowance, budget.id]);
      budget.daily_allowance = String(freshAllowance);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const remainingDays = remainingDaysFor(budget.end_date);
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
 * Catches the budget up to the current date, lazily — there's no cron
 * job "closing out the day" at midnight; instead, whenever the budget
 * is touched (read or spent against), this catches it up first. This
 * is what makes it safe against clock games: the server's own
 * CURRENT_DATE is the only clock that matters, never anything the
 * client sends.
 *
 * Unused daily allowance from a day that's now passed does NOT
 * auto-credit to banked_amount here — it accumulates in
 * pending_rollover_amount instead, and only becomes spendable once
 * the student explicitly confirms it (see confirmRollover/
 * declineRollover below and StudentHomeScreen's rollover prompt).
 * Handles gaps of more than one day correctly (e.g. a student who
 * doesn't open the app for 3 days doesn't lose that pending amount —
 * each fully-skipped day's ENTIRE daily_allowance adds to the pending
 * total, still awaiting one combined decision).
 *
 * pending_tomorrow_amount is different: it's an already-explicit
 * manual transfer the student confirmed on a previous day (see
 * transferRemainingToNextDay below), so it keeps crediting into
 * banked_amount automatically here, unaffected by this gate.
 *
 * Must be called with a client already inside a transaction that has
 * the budget row locked (SELECT...FOR UPDATE) — this function itself
 * doesn't lock, it assumes the caller already did.
 */
async function applyDailyRollover(client: import("pg").PoolClient, budget: BudgetRow): Promise<BudgetRow> {
  // Business-timezone "today" (L9) — the server's clock, never the client's.
  const today: string = businessDate();

  // node-postgres parses the DATE column as a JS Date object by
  // default, not the plain "YYYY-MM-DD" string this file's own
  // BudgetRow type claims — comparing it to `today` directly with
  // `===` never matched, so this "already caught up" guard never
  // actually short-circuited and the rollover math below ran on
  // EVERY read, crediting banked_amount again and again instead of
  // once per calendar day. Normalizing to the same string shape
  // before comparing fixes it (safe for a string, a Date, or null).
  const lastSpendDate: string | null = dateOnly(budget.last_spend_date as string | Date | null);

  if (lastSpendDate === today) {
    return budget; // Already caught up — the common case, no write needed.
  }

  const dailyAllowance = Number(budget.daily_allowance);
  let pendingRollover = Number(budget.pending_rollover_amount);

  if (lastSpendDate === null) {
    // First-ever spend on this budget — nothing to roll over yet,
    // just start tracking from today.
  } else {
    const daysElapsed = Math.max(1, daysBetweenDates(lastSpendDate, today));
    const unusedFromLastActiveDay = Math.max(0, dailyAllowance - Number(budget.spent_today));
    const fullySkippedDays = daysElapsed - 1;
    pendingRollover =
      Math.round((pendingRollover + unusedFromLastActiveDay + fullySkippedDays * dailyAllowance) * 100) / 100;
  }

  // A day has genuinely passed — this is the ONE moment any manually
  // transferred amount (via transferRemainingToNextDay) actually
  // becomes spendable. Before this point, pending_tomorrow_amount is
  // deliberately excluded from every "available today" calculation.
  // Unlike the silent rollover above, this was already explicitly
  // confirmed by the student on a previous day, so it credits
  // straight into banked_amount without a second confirmation.
  const pendingTomorrow = Number(budget.pending_tomorrow_amount);
  const banked = Math.round((Number(budget.banked_amount) + pendingTomorrow) * 100) / 100;

  // Hard invariant, independent of how the math above got here: a
  // plan can never roll over more than it actually has left. Without
  // this, any future bug in the day-crossing arithmetic (or a stale
  // daily_allowance read at just the wrong moment) turns directly into
  // a student being able to spend far more in one day than the plan
  // was ever meant to release — this clamp makes that impossible
  // regardless of what upstream produced pendingRollover/banked.
  const remaining = Number(budget.remaining_amount);
  const cappedPendingRollover = Math.min(pendingRollover, remaining);
  const cappedBanked = Math.min(banked, remaining);

  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET spent_today = 0, last_spend_date = $1, banked_amount = $2, pending_tomorrow_amount = 0, pending_rollover_amount = $3, updated_at = now()
     WHERE id = $4 RETURNING *`,
    [today, cappedBanked, cappedPendingRollover, budget.id]
  );
  return updated.rows[0];
}

/**
 * The student's explicit answer to "carry this over?" (see
 * applyDailyRollover above for why this exists instead of
 * auto-crediting). Confirming moves pending_rollover_amount into
 * banked_amount, where it finally becomes spendable.
 */
export async function confirmRollover(userId: string): Promise<BudgetRow & { remainingDays: number }> {
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

    const pending = Number(budget.pending_rollover_amount);
    if (pending > 0) {
      const newBanked = Math.min(
        Math.round((Number(budget.banked_amount) + pending) * 100) / 100,
        Number(budget.remaining_amount)
      );
      const updated = await client.query<BudgetRow>(
        `UPDATE budgets SET banked_amount = $1, pending_rollover_amount = 0, updated_at = now()
         WHERE id = $2 RETURNING *`,
        [newBanked, budget.id]
      );
      budget = updated.rows[0];
    }

    await client.query("COMMIT");
    const remainingDays = remainingDaysFor(budget.end_date);
    return { ...budget, remainingDays };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Declining forfeits pending_rollover_amount — it's dropped, not
 * banked, and can never be spent (see the updated Mealvest terms
 * disclaimer in BudgetOnboardingScreen: carry-forward is no longer
 * unconditional, the student decides each time).
 */
export async function declineRollover(userId: string): Promise<BudgetRow & { remainingDays: number }> {
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

    if (Number(budget.pending_rollover_amount) > 0) {
      const updated = await client.query<BudgetRow>(
        `UPDATE budgets SET pending_rollover_amount = 0, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [budget.id]
      );
      budget = updated.rows[0];
    }

    await client.query("COMMIT");
    const remainingDays = remainingDaysFor(budget.end_date);
    return { ...budget, remainingDays };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

export interface DeductionResult {
  budget: BudgetRow;
  /** Spendable-today after this deduction; the caller fires the low-balance notification AFTER its commit. */
  spendableTodayAfter: number;
  lowBalance: boolean;
}

/**
 * Deducts `amount` from the student's active budget using the CALLER'S
 * transaction (finding H2). The budget row is locked FOR UPDATE on
 * `client`, so concurrent orders serialize on it and can never both
 * spend the same balance; nothing is committed here — the order
 * payment that called this commits (or rolls back) the deduction and
 * the order status change together.
 */
export async function deductFromBudgetInTx(client: DbClient, userId: string, amount: number): Promise<DeductionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Deduction amount must be greater than zero.");
  }
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
  // budget's total remaining_amount.
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
  // If today's spend eats into the banked rollover, draw it down so it
  // can't be double-counted as still-available tomorrow.
  const bankedUsedToday = Math.max(0, newSpentToday - Number(budget.daily_allowance));
  const newBanked = Math.round((Number(budget.banked_amount) - bankedUsedToday) * 100) / 100;

  // The WHERE clause re-asserts the balance condition so the database
  // itself refuses an overspend even if the arithmetic above were wrong.
  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET remaining_amount = $1, amount_spent = $2, spent_today = $3, banked_amount = $4, updated_at = now()
     WHERE id = $5 AND status = 'active' AND remaining_amount >= $6
     RETURNING *`,
    [newRemaining, newSpent, newSpentToday, Math.max(0, newBanked), budget.id, amount]
  );
  if (updated.rows.length === 0) {
    throw new ApiError(402, "INSUFFICIENT_BALANCE", "This order costs more than your remaining plan balance.");
  }

  const updatedBudget = updated.rows[0];
  // Same "below a quarter of today's daily amount" threshold the
  // student dashboard's credit-ring colour coding uses.
  const spendableTodayAfter =
    Math.round((Number(updatedBudget.daily_allowance) + Number(updatedBudget.banked_amount) - Number(updatedBudget.spent_today)) * 100) / 100;
  return {
    budget: updatedBudget,
    spendableTodayAfter,
    lowBalance: spendableTodayAfter < Number(updatedBudget.daily_allowance) / 4,
  };
}

/** Standalone wrapper (own transaction) — kept for callers that don't need to compose. */
export async function deductFromBudget(userId: string, amount: number): Promise<BudgetRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await deductFromBudgetInTx(client, userId, amount);
    await client.query("COMMIT");
    if (result.lowBalance) {
      notificationEvents.lowBudgetWarning(userId, result.budget.id, result.spendableTodayAfter);
    }
    return result.budget;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Meal Boost / top-up credit — adds `amount` to an ACTIVE budget inside
 * the CALLER'S transaction (the payment-activation transaction, H1), so
 * the payment's success flip and the credit commit together. Only
 * total_amount and remaining_amount move; daily_allowance is recomputed
 * on the next read (getActiveBudget).
 *
 * Returns null (instead of throwing) when the budget is no longer
 * active, so activation can decide what to do with the money rather
 * than losing it.
 */
export async function applyBoostInTx(client: DbClient, budgetId: string, amount: number): Promise<BudgetRow | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Boost amount must be greater than zero.");
  }
  const result = await client.query<BudgetRow>(
    "SELECT * FROM budgets WHERE id = $1 AND status = 'active' FOR UPDATE",
    [budgetId]
  );
  const budget = result.rows[0];
  if (!budget) return null;

  const newTotal = Math.round((Number(budget.total_amount) + amount) * 100) / 100;
  const newRemaining = Math.round((Number(budget.remaining_amount) + amount) * 100) / 100;

  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET total_amount = $1, remaining_amount = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [newTotal, newRemaining, budgetId]
  );
  return updated.rows[0];
}

/**
 * Withdraws the unspent balance ("savings", including every rollover
 * amount the student carried forward) of a plan whose period has
 * ENDED. MEALVEST keeps a platform fee — platform_settings
 * 'savings_withdrawal_fee_percent', 10% by default — and the student
 * receives the rest. The percentage in force is frozen onto the row
 * (platform_fee_percent / platform_fee_amount) so a later change to
 * the setting never rewrites history, and migration 041's
 * chk_withdrawal_split_adds_up guarantees student + fee = gross.
 *
 * Any hotel loyalty incentive stays what it always was: a SEPARATE,
 * additive, platform/hotel-funded figure recorded alongside — never a
 * deduction from the student.
 *
 * The lock (end_date <= today) and the one-withdrawal-per-plan rule
 * are enforced here, inside the row lock, regardless of what the UI
 * showed — getWithdrawalStatus is only a convenience mirror of this.
 */
export const DEFAULT_WITHDRAWAL_FEE_PERCENT = 10;

export async function getWithdrawalFeePercent(client: Pick<import("pg").Pool, "query"> = pool): Promise<number> {
  const result = await client.query("SELECT value FROM platform_settings WHERE key = 'savings_withdrawal_fee_percent'");
  const parsed = Number(result.rows[0]?.value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return DEFAULT_WITHDRAWAL_FEE_PERCENT;
  return parsed;
}

/** Cent-precise split; the fee is rounded to the cent and the student gets the exact remainder, so the two always sum to gross. */
export function computeWithdrawalSplit(grossSavings: number, feePercent: number): { feeAmount: number; studentAmount: number } {
  const gross = Math.round(grossSavings * 100) / 100;
  const feeAmount = Math.round(gross * (feePercent / 100) * 100) / 100;
  const studentAmount = Math.round((gross - feeAmount) * 100) / 100;
  return { feeAmount, studentAmount };
}

export async function withdrawSavings(params: {
  userId: string;
  payoutMethod: "mpesa" | "bank";
  payoutDestination: string;
}): Promise<{
  withdrawalId: string;
  gross_savings: number;
  platform_fee_percent: number;
  platform_fee_amount: number;
  student_amount: number;
  hotel_incentive_amount: number;
  status: string;
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

    const endDateResult = await client.query("SELECT (end_date <= $2::date) AS ended FROM budgets WHERE id = $1", [
      budget.id,
      businessDate(),
    ]);
    if (!endDateResult.rows[0].ended) {
      throw new ApiError(
        403,
        "CONTRACT_ACTIVE",
        "Withdrawal becomes available after your Mealvest plan period ends."
      );
    }

    // A REJECTED request (whose amount was restored) doesn't block a new one (migration 047).
    const existing = await client.query("SELECT id FROM savings_withdrawals WHERE budget_id = $1 AND status <> 'rejected'", [
      budget.id,
    ]);
    if (existing.rows.length > 0) {
      throw new ApiError(409, "ALREADY_WITHDRAWN", "This plan's savings have already been withdrawn.");
    }

    // Everything still unspent — today's unused credit, banked rollover,
    // anything parked for tomorrow or awaiting a rollover decision — is
    // part of remaining_amount, so nothing the student carried forward
    // is left behind.
    const grossSavings = Math.round(Number(budget.remaining_amount) * 100) / 100;
    if (grossSavings <= 0) {
      throw new ApiError(409, "NOTHING_TO_WITHDRAW", "There is no unspent balance left on this plan to withdraw.");
    }

    const feePercent = await getWithdrawalFeePercent(client);
    const { feeAmount, studentAmount } = computeWithdrawalSplit(grossSavings, feePercent);

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
         (user_id, budget_id, hotel_id, gross_savings, student_amount, platform_fee_percent, platform_fee_amount,
          hotel_incentive_amount, payout_method, payout_destination, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       RETURNING id`,
      [
        params.userId,
        budget.id,
        hotelId,
        grossSavings,
        studentAmount,
        feePercent,
        feeAmount,
        hotelIncentiveAmount,
        params.payoutMethod,
        params.payoutDestination,
      ]
    );

    await client.query(
      `UPDATE budgets
       SET status = 'completed', remaining_amount = 0, banked_amount = 0, pending_tomorrow_amount = 0,
           pending_rollover_amount = 0, updated_at = now()
       WHERE id = $1`,
      [budget.id]
    );

    await client.query("COMMIT");

    return {
      withdrawalId: withdrawal.rows[0].id,
      gross_savings: grossSavings,
      platform_fee_percent: feePercent,
      platform_fee_amount: feeAmount,
      student_amount: studentAmount,
      hotel_incentive_amount: hotelIncentiveAmount,
      status: "pending",
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin rejection of a savings withdrawal (finding M1). withdrawSavings
 * reserved the money by closing the plan (status 'completed',
 * remaining 0); rejecting gives it back EXACTLY ONCE, in one database
 * transaction:
 *
 *  - the withdrawal row is locked and must still be open
 *    (pending/processing/failed); restored_at must be NULL,
 *  - the student row is locked (same lock order as payment activation),
 *  - the gross amount goes back to the ORIGINAL plan, re-opened as
 *    'active' (its end date has passed, so the student can withdraw
 *    again) — or, if the student has since started another plan, it is
 *    credited to that active plan instead (only one may be active),
 *  - the row is marked rejected with restored_at/amount/budget; migration
 *    047's trigger makes those immutable and 'rejected' final.
 *
 * A repeated or concurrent rejection finds the row already final and
 * fails with 409 — it can never restore twice.
 */
export async function rejectWithdrawalAndRestore(params: {
  withdrawalId: string;
  adminUserId: string;
  note?: string | null;
}): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wResult = await client.query("SELECT * FROM savings_withdrawals WHERE id = $1 FOR UPDATE", [params.withdrawalId]);
    const w = wResult.rows[0];
    if (!w) throw new ApiError(404, "WITHDRAWAL_NOT_FOUND", "No matching withdrawal found.");
    if (!["pending", "processing", "failed"].includes(w.status) || w.restored_at) {
      throw new ApiError(409, "WITHDRAWAL_FINAL", `This withdrawal is already ${w.status} and can't be changed.`);
    }

    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [w.user_id]);

    const gross = Number(w.gross_savings);
    let restoredTo: string | null = null;

    if (gross > 0) {
      const original = await client.query<BudgetRow>("SELECT * FROM budgets WHERE id = $1 FOR UPDATE", [w.budget_id]);
      const active = await client.query<BudgetRow>(
        "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
        [w.user_id]
      );
      if (active.rows[0] && active.rows[0].id !== w.budget_id) {
        const credited = await applyBoostInTx(client, active.rows[0].id, gross);
        restoredTo = credited?.id ?? null;
      } else if (original.rows[0]) {
        const b = original.rows[0];
        const updated = await client.query<BudgetRow>(
          `UPDATE budgets
              SET status = 'active', remaining_amount = remaining_amount + $2, updated_at = now()
            WHERE id = $1 AND status IN ('completed', 'active')
            RETURNING id`,
          [b.id, gross]
        );
        restoredTo = updated.rows[0]?.id ?? null;
      }
      if (!restoredTo) {
        // Nowhere safe to put it back automatically — refuse rather than lose it.
        throw new ApiError(409, "RESTORE_TARGET_MISSING", "The student's plan could not be found to restore this amount. Resolve manually.");
      }
    }

    const updated = await client.query(
      `UPDATE savings_withdrawals
          SET status = 'rejected', restored_at = now(), restored_amount = $2, restored_to_budget_id = $3,
              admin_note = COALESCE($4, admin_note), processed_at = now(), processed_by = $5
        WHERE id = $1 AND restored_at IS NULL
        RETURNING *`,
      [w.id, gross, restoredTo, params.note ?? null, params.adminUserId]
    );
    if (updated.rows.length === 0) {
      throw new ApiError(409, "WITHDRAWAL_FINAL", "This withdrawal has already been closed.");
    }
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
