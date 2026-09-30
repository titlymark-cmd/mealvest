import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/notificationModel";
import * as notificationEvents from "../services/notificationEvents";

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
  if (req.headers.authorization !== `Bearer ${env.cronSecret}`) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid cron credentials.");
  }
}

/** Nairobi (UTC+3, no DST) wall-clock "now" — same convention as mpesa/daraja.ts's own timestamp helper. */
function nairobiNow(): Date {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

/**
 * GET /api/cron/meal-reminders — triggered on a schedule by Vercel
 * Cron (see vercel.json). Finds every student whose chosen reminder
 * time falls in the current 15-minute bucket and has an active plan,
 * and fires one reminder each. Fire-and-forget + dedupeKeyed per user
 * per day (see notificationEvents.mealReminder), so an overlapping or
 * retried cron invocation can never double-send.
 */
export async function runMealReminders(req: Request, res: Response, next: NextFunction) {
  try {
    requireCronSecret(req);

    const now = nairobiNow();
    const minutesSinceMidnight = now.getUTCHours() * 60 + now.getUTCMinutes();
    const bucketIndex = Math.floor(minutesSinceMidnight / 15);
    const nairobiDateStr = now.toISOString().slice(0, 10);

    const userIds = await model.listUsersDueForMealReminder(bucketIndex);
    for (const userId of userIds) {
      notificationEvents.mealReminder(userId, nairobiDateStr);
    }

    res.json({ queued: userIds.length, bucketIndex, nairobiDateStr });
  } catch (err) {
    next(err);
  }
}
