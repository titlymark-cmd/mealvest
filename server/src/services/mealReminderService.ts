import { notify } from "./notificationService";
import { businessDate, zone } from "../lib/businessTime";
import * as model from "../models/notificationModel";

/**
 * Meal reminders that honour each student's own reminder_time.
 *
 * The endpoint is meant to be called OFTEN (every 5–15 minutes). Each call reminds the
 * students whose chosen time (Africa/Nairobi) has arrived within the last
 * CATCH_UP minutes, and who haven't had today's reminder yet. Re-running it is harmless:
 * the per-user-per-day dedupe key makes a duplicate or overlapping run a no-op.
 *
 * Why a catch-up window rather than "exactly now": schedulers drift and occasionally skip a
 * run; a window means a student whose time was 12:00 still gets reminded at 12:10 if the
 * 12:00 run was missed — but never at 21:00 for a 12:00 preference.
 *
 * Vercel Hobby crons run at most once a day, so on their own they can only serve students
 * whose time falls just before that single run. Use an external free scheduler for the
 * 15-minute cadence (see docs/PRODUCTION_SETUP.md).
 */
export const MEAL_REMINDER_CATCHUP_MINUTES = (): number => {
  const n = Number(process.env.MEAL_REMINDER_CATCHUP_MINUTES);
  return Number.isFinite(n) && n >= 5 && n <= 360 ? Math.floor(n) : 90;
};

const TIME_BUDGET_MS = 45_000;
const CHUNK = 10;

function secondsToTime(total: number): string {
  const s = Math.max(0, Math.min(86_399, Math.floor(total)));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

/** Seconds since local midnight in the business timezone. */
export function localSecondsOfDay(at: Date, timeZone: string = zone()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
}

export interface ReminderRunSummary {
  date: string;
  window: { from: string; to: string };
  due: number;
  sent: number;
  remaining: number;
  staleDevicesPurged: number;
  durationMs: number;
}

export async function runMealReminders(now: Date = new Date()): Promise<ReminderRunSummary> {
  const started = Date.now();
  const date = businessDate(now);
  const nowSec = localSecondsOfDay(now);
  const from = secondsToTime(nowSec - MEAL_REMINDER_CATCHUP_MINUTES() * 60);
  const to = secondsToTime(nowSec);

  const userIds = await model.listUsersDueForMealReminder({ from, to, dedupeKey: `meal_reminder:${date}` });

  let sent = 0;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // unfinished users are picked up by the next run (still inside their window)
    const chunk = userIds.slice(i, i + CHUNK);
    // notify() never throws and is idempotent per dedupeKey. Awaited here so the work completes
    // inside this invocation instead of being frozen after the response.
    await Promise.all(
      chunk.map((userId) =>
        notify({
          userId,
          type: "meal_reminder",
          title: "Don't forget your meal today 🍽️",
          body: "Your MEALVEST plan is ready whenever you're hungry — tap to order.",
          deepLink: "/student/home",
          category: "meal_reminders",
          dedupeKey: `meal_reminder:${date}`,
        })
      )
    );
    sent += chunk.length;
  }

  let purged = 0;
  try {
    purged = await model.purgeStaleDevices();
  } catch (err) {
    console.error("[mealReminders] stale device purge failed:", (err as Error).message);
  }

  return { date, window: { from, to }, due: userIds.length, sent, remaining: userIds.length - sent, staleDevicesPurged: purged, durationMs: Date.now() - started };
}
