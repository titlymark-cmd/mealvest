import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import * as notificationEvents from "./notificationEvents";
import { businessDate, dateOnly, daysBetweenDates, addDays } from "../lib/businessTime";
import { toCents, centsToStr, centsToNumber } from "../lib/money";

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
  /** Carried-forward money from earlier days (additive to the fixed daily allowance). */
  banked_amount: string;
  /** LEGACY (retired): folded into banked_amount at the next rollover; never written with a non-zero value any more. */
  pending_tomorrow_amount: string;
  /** LEGACY (retired): folded into banked_amount on the next touch; never written with a non-zero value any more. */
  pending_rollover_amount: string;
  /** Money held by paid-but-unscanned meal passes; not yet spent (migration 055). */
  reserved_amount: string;
  created_at: string;
  updated_at: string;
}

/**
 * APPROVED FINANCIAL MODEL (Stage 1)
 *
 *  - daily_allowance is FIXED for the life of the plan: amount funded / plan days
 *    (floored to the cent so allowance x days never exceeds the funded amount).
 *    It is never recomputed from remaining_amount / remaining days. The only
 *    thing that changes it is a Meal Boost (see applyBoostInTx).
 *  - Unused money carries forward AUTOMATICALLY and ADDITIVELY in banked_amount.
 *    banked_amount only changes at a day boundary (applyDailyRollover) — spending
 *    during the day only increases spent_today, so carry-forward can never be
 *    deducted twice.
 *
 *      available today   = daily_allowance + banked_amount - spent_today - reserved_amount
 *      free plan balance = remaining_amount - reserved_amount
 *
 *    A purchase must fit inside BOTH. (available is additionally clamped to the
 *    free plan balance so a display can never promise money the plan doesn't have.)
 */
export function computeDailyAllowance(fundedAmount: number, planDays: number): number {
  const days = Math.max(1, Math.trunc(planDays));
  return Math.floor(toCents(fundedAmount) / days) / 100;
}

/** Days left in the plan, counted in business-timezone calendar days (minimum 1). Display + boost split. */
function remainingDaysFor(endDate: string | Date): number {
  const end = dateOnly(endDate as string | Date)!;
  return Math.max(1, daysBetweenDates(businessDate(), end));
}

/** The one place the spendable-balance formulas live. All values in integer cents. */
export function computeAvailability(
  b: Pick<BudgetRow, "daily_allowance" | "banked_amount" | "spent_today" | "reserved_amount" | "remaining_amount">
) {
  const allowance = toCents(b.daily_allowance);
  const carried = toCents(b.banked_amount);
  const spent = toCents(b.spent_today);
  const reserved = toCents(b.reserved_amount);
  const remaining = toCents(b.remaining_amount);
  const freePlan = Math.max(0, remaining - reserved);
  const rawAvailable = allowance + carried - spent - reserved;
  const availableToday = Math.max(0, Math.min(rawAvailable, freePlan));
  return { allowance, carried, spent, reserved, remaining, freePlan, rawAvailable, availableToday, todayTotal: allowance + carried };
}

export interface BudgetView extends BudgetRow {
  remainingDays: number;
  /** Server-calculated figures — the ONLY source the UI should display for these. */
  available_today: number;
  free_plan_balance: number;
  carried_forward_amount: number;
  held_amount: number;
  /** Fixed daily allowance + carry-forward: the day's total pool, for the "% spent" ring. */
  today_total: number;
}

export function toBudgetView(b: BudgetRow): BudgetView {
  const a = computeAvailability(b);
  return {
    ...b,
    remainingDays: remainingDaysFor(b.end_date),
    available_today: centsToNumber(a.availableToday),
    free_plan_balance: centsToNumber(a.freePlan),
    carried_forward_amount: centsToNumber(a.carried),
    held_amount: centsToNumber(a.reserved),
    today_total: centsToNumber(a.todayTotal),
  };
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
  // FIXED for the whole plan (approved rule A.1): original amount / plan days.
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
 * The student's active budget, caught up to today (rollover applied) and
 * decorated with the server-calculated available / free / carried figures.
 * Every "get my budget" read goes through here; the daily allowance is the
 * stored FIXED value — it is no longer recalculated on read.
 */
export async function getActiveBudget(userId: string): Promise<BudgetView | null> {
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
    // Catching up on every read means the dashboard shows the correct
    // carried-forward figure the moment the app opens on a new day.
    budget = await applyDailyRollover(client, result.rows[0]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return toBudgetView(budget);
}

/**
 * Pure rollover math (unit-testable). Carry-forward is automatic and additive.
 * At a day boundary:
 *
 *   carried_new = max(0, allowance + carried_old - spent_on_last_active_day)   // unused part of that day's pool
 *               + (fully skipped days) x allowance                              // days nobody touched the app
 *               + legacy pending_tomorrow_amount + legacy pending_rollover_amount  // retired fields, folded in once
 *
 * capped at remaining_amount. Outstanding holds (reserved_amount) are NOT spent,
 * so they stay inside the carry and keep being subtracted from "available" until
 * settled or released — never double-counted. A plan never touched before uses
 * start_date as its baseline so untouched days still carry forward.
 */
export function computeRollover(
  budget: Pick<
    BudgetRow,
    "daily_allowance" | "banked_amount" | "spent_today" | "remaining_amount" | "pending_tomorrow_amount" | "pending_rollover_amount" | "last_spend_date" | "start_date"
  >,
  today: string
): { changed: boolean; dayAdvanced: boolean; bankedCents: number } {
  const last = dateOnly(budget.last_spend_date as string | Date | null);
  const base = last ?? dateOnly(budget.start_date as string | Date)!;
  const elapsed = daysBetweenDates(base, today);
  const allowance = toCents(budget.daily_allowance);
  const carriedOld = toCents(budget.banked_amount);
  const legacyRollover = toCents(budget.pending_rollover_amount);
  const remaining = toCents(budget.remaining_amount);

  if (last !== today && elapsed > 0) {
    const unused = Math.max(0, allowance + carriedOld - toCents(budget.spent_today));
    const skipped = (elapsed - 1) * allowance;
    const banked = Math.min(remaining, unused + skipped + toCents(budget.pending_tomorrow_amount) + legacyRollover);
    return { changed: true, dayAdvanced: true, bankedCents: banked };
  }
  if (legacyRollover > 0) {
    return { changed: true, dayAdvanced: false, bankedCents: Math.min(remaining, carriedOld + legacyRollover) };
  }
  // Same day (or a first touch on the start day): nothing to carry.
  return { changed: last === null && elapsed === 0, dayAdvanced: false, bankedCents: carriedOld };
}

/**
 * Catches the budget up to the current Africa/Nairobi date, lazily (no midnight
 * job). Idempotent per calendar day: once last_spend_date = today, carried money
 * is never changed again. Must be called with the budget row locked FOR UPDATE.
 */
async function applyDailyRollover(client: DbClient, budget: BudgetRow): Promise<BudgetRow> {
  const today: string = businessDate();
  const r = computeRollover(budget, today);
  if (!r.changed) return budget;

  const updated = r.dayAdvanced
    ? await client.query<BudgetRow>(
        `UPDATE budgets SET spent_today = 0, last_spend_date = $1, banked_amount = $2,
                pending_tomorrow_amount = 0, pending_rollover_amount = 0, updated_at = now()
         WHERE id = $3 RETURNING *`,
        [today, centsToStr(r.bankedCents), budget.id]
      )
    : await client.query<BudgetRow>(
        `UPDATE budgets SET last_spend_date = $1, banked_amount = $2, pending_rollover_amount = 0, updated_at = now()
         WHERE id = $3 RETURNING *`,
        [today, centsToStr(r.bankedCents), budget.id]
      );
  return updated.rows[0];
}

/**
 * RETIRED (Stage 1). Carry-forward is now automatic, so the student no longer
 * confirms it. Kept as an idempotent read so an older cached client calling the
 * endpoint just gets the current, correct budget (any legacy pending amount is
 * folded into carry-forward by the rollover).
 */
export async function confirmRollover(userId: string): Promise<BudgetView> {
  const budget = await getActiveBudget(userId);
  if (!budget) throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan.");
  return budget;
}

export interface DeductionResult {
  budget: BudgetRow;
  /** Spendable-today after this deduction; the caller fires the low-balance notification AFTER its commit. */
  spendableTodayAfter: number;
  lowBalance: boolean;
}

/** Throws the same two errors a spend/hold has always thrown, measured against what is still FREE. */
function assertFits(budget: BudgetRow, amountCents: number, noun: "order" | "meal"): void {
  const a = computeAvailability(budget);
  if (amountCents > a.rawAvailable) {
    throw new ApiError(
      402,
      "DAILY_LIMIT_EXCEEDED",
      `This ${noun} costs more than today's available balance (${centsToNumber(Math.max(0, a.rawAvailable))} left today, including any carried-forward amount and after meal passes already held).`
    );
  }
  if (amountCents > a.freePlan) {
    throw new ApiError(402, "INSUFFICIENT_BALANCE", `This ${noun} costs more than your remaining plan balance.`);
  }
}

/**
 * Deducts `amount` using the CALLER'S transaction (finding H2). The budget row is
 * locked FOR UPDATE so concurrent orders serialize; nothing is committed here.
 * A direct spend only increases spent_today (carry-forward is untouched until the
 * next day boundary) and respects outstanding holds.
 */
export async function deductFromBudgetInTx(client: DbClient, userId: string, amount: number): Promise<DeductionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Deduction amount must be greater than zero.");
  }
  const amountCents = toCents(amount);
  const result = await client.query<BudgetRow>(
    "SELECT * FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
    [userId]
  );
  let budget = result.rows[0];
  if (!budget) {
    throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan.");
  }
  budget = await applyDailyRollover(client, budget);
  assertFits(budget, amountCents, "order");

  // NUMERIC arithmetic in SQL; the WHERE re-asserts the free-balance condition so
  // the database itself refuses an overspend even if the checks above were wrong.
  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET remaining_amount = remaining_amount - $1::numeric,
            amount_spent = amount_spent + $1::numeric,
            spent_today = spent_today + $1::numeric, updated_at = now()
     WHERE id = $2 AND status = 'active' AND (remaining_amount - reserved_amount) >= $1::numeric
     RETURNING *`,
    [centsToStr(amountCents), budget.id]
  );
  if (updated.rows.length === 0) {
    throw new ApiError(402, "INSUFFICIENT_BALANCE", "This order costs more than your remaining plan balance.");
  }

  const updatedBudget = updated.rows[0];
  const after = computeAvailability(updatedBudget);
  return {
    budget: updatedBudget,
    spendableTodayAfter: centsToNumber(after.availableToday),
    lowBalance: after.availableToday < after.allowance / 4,
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

// ---------------------------------------------------------------------------
// Meal-pass reservations ("hold, settle on scan") — migration 055.
//
// A meal pass HOLDS money (reserved_amount) instead of spending it. The hold
// becomes a real spend ONLY when the hotel scans the QR (settleReservationInTx,
// called from redeemOrderByQr). If the pass is never scanned it is released
// (releaseReservationInTx) by an explicit cancel, or by the timed sweep below.
//
// Locking rule to stay deadlock-free: every caller that locks BOTH an order
// and a budget locks the ORDER first, then the budget. These helpers lock only
// the budget, so they compose safely under that rule.
// ---------------------------------------------------------------------------

export interface ReservationResult {
  budget: BudgetRow;
  budgetId: string;
  spendableTodayAfter: number;
  lowBalance: boolean;
}

/**
 * Places a HOLD of `amount` on the student's active budget. Nothing is spent:
 * only reserved_amount moves. Enforces the same two caps as a real spend, but
 * measured against what is still FREE after existing holds — today's spendable
 * minus reserved, and the plan's remaining minus reserved — so held money can
 * never be reserved or spent twice. Caller supplies the transaction.
 */
export async function reserveFromBudgetInTx(client: DbClient, userId: string, amount: number): Promise<ReservationResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Reservation amount must be greater than zero.");
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

  const amountCents = toCents(amount);
  // Measured against what is still FREE after existing holds (today's available
  // and the free plan balance), so held money can never be reserved/spent twice.
  assertFits(budget, amountCents, "meal");

  // NUMERIC arithmetic in SQL. The WHERE re-asserts the free-plan condition
  // against the row's CURRENT reserved_amount, so the database itself refuses
  // an over-hold.
  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET reserved_amount = reserved_amount + $1::numeric, updated_at = now()
     WHERE id = $2 AND status = 'active' AND (remaining_amount - reserved_amount) >= $1::numeric
     RETURNING *`,
    [centsToStr(amountCents), budget.id]
  );
  if (updated.rows.length === 0) {
    throw new ApiError(402, "INSUFFICIENT_BALANCE", "This meal costs more than your remaining plan balance.");
  }

  const b = updated.rows[0];
  const after = computeAvailability(b);
  return {
    budget: b,
    budgetId: b.id,
    spendableTodayAfter: centsToNumber(after.availableToday),
    lowBalance: after.availableToday < after.allowance / 4,
  };
}

/**
 * Settles a previously-held amount into a real spend — called inside
 * redeemOrderByQr's transaction when the hotel scans the QR. Moves the money
 * out of reserved_amount and into the spend ledger (remaining/amount_spent/
 * spent_today; carry-forward is untouched). No
 * cap re-check: the hold already guaranteed the funds, and remaining_amount has
 * not moved since. Returns null if the budget is no longer active (rare: e.g.
 * the plan was withdrawn after the hold) so the caller can still complete the
 * redemption without blocking a meal the hotel already served.
 */
export async function settleReservationInTx(client: DbClient, budgetId: string, amount: number): Promise<BudgetRow | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_ARGUMENT", "Settlement amount must be greater than zero.");
  }
  const result = await client.query<BudgetRow>("SELECT * FROM budgets WHERE id = $1 FOR UPDATE", [budgetId]);
  let budget = result.rows[0];
  if (!budget || budget.status !== "active") return null;

  budget = await applyDailyRollover(client, budget);

  // The money moves out of the hold and into the spend ledger, exactly once
  // (the caller gates on the order's status under its row lock). Only
  // spent_today grows — carry-forward (banked_amount) is NOT touched here, which
  // is what previously deducted carried money twice. NUMERIC arithmetic in SQL;
  // LEAST/GREATEST keep remaining/reserved from ever going negative so a meal
  // the hotel already served can still be completed.
  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET
            amount_spent = amount_spent + LEAST($2::numeric, remaining_amount),
            spent_today = spent_today + LEAST($2::numeric, remaining_amount),
            remaining_amount = GREATEST(0, remaining_amount - $2::numeric),
            reserved_amount = GREATEST(0, reserved_amount - $2::numeric),
            updated_at = now()
     WHERE id = $1 RETURNING *`,
    [budgetId, centsToStr(toCents(amount))]
  );
  return updated.rows[0];
}

/**
 * Releases a hold back to the plan (money "reorganizes" back) — called when a
 * meal pass is cancelled (student left it unscanned) or swept for timeout.
 * Only reserved_amount moves; nothing was ever spent. Idempotent-safe via
 * GREATEST so a double release can never push reserved below zero.
 */
export async function releaseReservationInTx(client: DbClient, budgetId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await client.query(
    `UPDATE budgets SET reserved_amount = GREATEST(0, reserved_amount - $2), updated_at = now()
     WHERE id = $1`,
    [budgetId, centsToStr(toCents(amount))]
  );
}

/**
 * Timed sweep: releases meal passes that were held but never scanned after the
 * hold TTL (ORDER_HOLD_TTL_MINUTES, default 30). Covers the cases the on-leave
 * cancel can't — a closed tab, a crash, a lost connection. Locks the ORDER
 * first then the budget (the global order→budget rule), one short transaction
 * per order, so it never deadlocks with a concurrent scan/pay.
 */
export async function releaseExpiredReservations(): Promise<{ released: number }> {
  const ttlMinutes = Number(process.env.ORDER_HOLD_TTL_MINUTES) || 30;
  const candidates = await pool.query<{ id: string }>(
    `SELECT id FROM orders
     WHERE status IN ('paid', 'ready') AND budget_id IS NOT NULL
       AND reserved_at IS NOT NULL AND reserved_at < now() - ($1 || ' minutes')::interval
     LIMIT 500`,
    [String(ttlMinutes)]
  );

  let released = 0;
  for (const { id } of candidates.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const o = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [id]);
      const order = o.rows[0];
      if (!order || (order.status !== "paid" && order.status !== "ready")) {
        await client.query("COMMIT");
        continue;
      }
      await client.query(
        "UPDATE orders SET status = 'cancelled', idempotency_key = NULL, updated_at = now() WHERE id = $1 AND status IN ('paid', 'ready')",
        [id]
      );
      if (order.budget_id) {
        await releaseReservationInTx(client, order.budget_id, Number(order.amount));
      }
      await client.query("COMMIT");
      released++;
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      client.release();
    }
  }
  return { released };
}

/**
 * Meal Boost / top-up credit — adds `amount` to an ACTIVE budget inside
 * the CALLER'S transaction (the payment-activation transaction, H1), so
 * the payment's success flip and the credit commit together. total_amount and
 * remaining_amount grow by the boost and the FIXED daily_allowance is raised by
 * boost / days left (see the body). Nothing else is redistributed.
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
  let budget = result.rows[0];
  if (!budget) return null;

  // Catch up to today FIRST so any skipped days are carried at the OLD fixed
  // allowance, before the boost changes it.
  budget = await applyDailyRollover(client, budget);

  // Approved rule: a boost raises the FIXED daily allowance by boost / days left
  // (counting today, min 1). Floored to the cent; any sub-cent remainder stays in
  // remaining_amount (withdrawable). Existing carry-forward is never redistributed.
  const boostCents = toCents(amount);
  const increment = Math.floor(boostCents / remainingDaysFor(budget.end_date));

  const updated = await client.query<BudgetRow>(
    `UPDATE budgets SET total_amount = total_amount + $1::numeric,
            remaining_amount = remaining_amount + $1::numeric,
            daily_allowance = daily_allowance + $2::numeric, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [centsToStr(boostCents), centsToStr(increment), budgetId]
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
