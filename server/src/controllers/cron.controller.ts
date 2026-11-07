import crypto from "crypto";
import { pool } from "../config/db";
import { sendSMS } from "../services/smsService";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { runMealReminders as runMealRemindersService } from "../services/mealReminderService";
import { runReconciliation } from "../services/reconciliationService";
import { runDailyPayouts } from "../services/dailyPayoutService";
import { releaseExpiredReservations } from "../services/budgetService";

/**
 * Guards every cron endpoint below. Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on requests it triggers for a
 * path listed under "crons" in vercel.json (see vercel.json +
 * DEPLOYMENT.md) — checked here rather than requireAuth, since this
 * isn't a signed-in user request at all. If CRON_SECRET isn't
 * configured yet, the endpoint refuses every call rather than quietly
 * running unauthenticated.
 */
function requireCronSecret(req: Request): void {
  if (!env.cronSecret) {
    throw new ApiError(503, "CRON_NOT_CONFIGURED", "CRON_SECRET is not configured.");
  }
  // Constant-time comparison (L3) over SHA-256 digests, so neither the
  // content nor the length of the secret leaks through timing.
  const provided = crypto.createHash("sha256").update(String(req.headers.authorization ?? "")).digest();
  const expected = crypto.createHash("sha256").update(`Bearer ${env.cronSecret}`).digest();
  if (!crypto.timingSafeEqual(provided, expected)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid cron credentials.");
  }
}

/**
 * GET /api/cron/meal-reminders — call every 5–15 minutes. Each call reminds the
 * opted-in students with an active plan whose own reminder_time (Africa/Nairobi)
 * has just arrived. Deduped per user per day, so retried, overlapping or
 * duplicate invocations can never double-send. Vercel Hobby cron (daily at most)
 * can't provide that cadence alone — see docs/PRODUCTION_SETUP.md.
 */
export async function runMealReminders(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);
    // Honours each student's reminder_time; see services/mealReminderService.ts.
    res.json(await runMealRemindersService());
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/cron/reconcile — repairs payments that were confirmed by the
 * provider but never credited, and resolves payouts whose outcome is
 * unknown, always under their original reference (see
 * reconciliationService.ts). Idempotent and safe to run concurrently.
 */
export async function runReconcile(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);
    const summary = await runReconciliation();
    // Also release meal passes held but never scanned past their TTL — the
    // safety net behind the on-leave cancel (closed tabs, crashes, lost
    // connections). Always returns money, never throws fatally for reconcile.
    let holdsReleased = 0;
    try {
      holdsReleased = (await releaseExpiredReservations()).released;
    } catch {
      /* non-fatal: the next run retries */
    }
    res.json({ ...summary, holdsReleased });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/cron/release-holds — releases meal passes held but never scanned
 * past ORDER_HOLD_TTL_MINUTES. Standalone so a scheduler can run it far more
 * often than the daily reconcile (the hold TTL is minutes, not days).
 * Idempotent and safe to run concurrently.
 */
export async function runReleaseHolds(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);
    res.json(await releaseExpiredReservations());
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/cron/daily-payouts — evaluates every DAILY-payout hotel whose
 * configured Africa/Nairobi time has arrived (see dailyPayoutService.ts).
 * Must be invoked frequently (every 5-15 minutes) by a scheduler; Vercel
 * Hobby cron (daily at most) is NOT sufficient — see AUTOMATED_PAYOUTS.md.
 * Idempotent and safe to run concurrently or repeatedly.
 */
export async function runDailyPayoutsCron(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);
    res.json(await runDailyPayouts());
  } catch (err) {
    next(err);
  }
}

/** Daily 6pm SMS to voters whose hotel has partnered. */
export async function runVotingReminders(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);
    const result = await pool.query(
      `SELECT v.phone, h.name AS hotel_name
       FROM hotel_votes v
       JOIN hotels h ON h.id = v.hotel_id
       WHERE v.status = 'pending' AND h.status = 'active'`
    );
    let sent = 0;
    for (const row of result.rows) {
      try {
        await sendSMS({
          phoneNumber: row.phone,
          message: `Mealvest has partnered with ${row.hotel_name}! Your profile is active. Create your account: https://mealvest.co.ke/register/student`,
        });
        sent++;
      } catch (_) { /* continue */ }
    }
    res.json({ success: true, remindersSent: sent });
  } catch (err) {
    next(err);
  }
}
