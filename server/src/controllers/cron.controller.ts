import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/notificationModel";
import * as notificationEvents from "../services/notificationEvents";
import { runReconciliation } from "../services/reconciliationService";
import { runDailyPayouts } from "../services/dailyPayoutService";
import { businessDate } from "../lib/businessTime";

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
 * GET /api/cron/meal-reminders — triggered once daily by Vercel Cron
 * (see vercel.json; Hobby-plan accounts can't schedule more often than
 * daily). Reminds every opted-in student with an active plan. Fire-
 * and-forget + dedupeKeyed per user per day (see
 * notificationEvents.mealReminder), so a retried or duplicate cron
 * invocation can never double-send.
 */
export async function runMealReminders(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);

    const nairobiDateStr = businessDate();

    const userIds = await model.listUsersDueForMealReminder();
    for (const userId of userIds) {
      notificationEvents.mealReminder(userId, nairobiDateStr);
    }

    res.json({ queued: userIds.length, nairobiDateStr });
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
    res.json(summary);
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
