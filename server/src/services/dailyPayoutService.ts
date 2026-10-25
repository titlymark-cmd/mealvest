import { env } from "../config/env";
import { businessDate, businessTimeOfDay } from "../lib/businessTime";
import * as model from "../models/hotelPayoutModel";
import { evaluateScheduledPayout, AutoPayoutOutcome } from "./hotelPayoutService";

/**
 * Daily Payout scheduler.
 *
 * `runDailyPayouts` is meant to be invoked REPEATEDLY (every few minutes)
 * by an external scheduler hitting GET /api/cron/daily-payouts — see
 * AUTOMATED_PAYOUTS.md. Each call finds the DAILY hotels whose configured
 * Africa/Nairobi time has already passed today and that have not been
 * settled for today, and for each one (independently):
 *
 *   1. claims today's evaluation (hotel_daily_payout_runs, UNIQUE per
 *      hotel+day) — so overlapping/duplicate invocations evaluate a hotel
 *      once; a crashed run's lease expires and is re-claimed;
 *   2. calls evaluateScheduledPayout — the SAME balance → threshold →
 *      reservation (orders.payout_id under the hotel row lock) → send path
 *      the instant mode uses, carrying the FULL unreserved balance in ONE
 *      payout. Orders redeemed after that reservation simply stay
 *      unreserved for the next payout;
 *   3. records the outcome. Below the KSh threshold nothing is reserved:
 *      the earnings stay unpaid and carry forward, and the hotel stays in
 *      daily mode.
 *
 * Money safety does NOT rest on the date: the date key only bounds how
 * often the scheduler re-evaluates. Duplicate payment is prevented by the
 * order claim + the one-unsent-payout-per-hotel index + the existing
 * reference/Idempotency-Key + reconciliation of unknown outcomes, none of
 * which are modified here. A hotel with an unresolved ('unknown'/'pending'
 * /'review'/'approved') payout is skipped (retried later), never re-sent.
 *
 * One hotel's failure never stops the others.
 */

export const DAILY_RUN_MAX_ATTEMPTS = 4;
export const DAILY_RUN_RETRY_AFTER_MINUTES = 15;
export const DAILY_RUN_LEASE_MINUTES = 10;
export const DAILY_RUN_BATCH = 50;

export interface DailyPayoutDeps {
  listDue: typeof model.listDailyHotelsDue;
  claimRun: typeof model.claimDailyRun;
  finishRun: typeof model.finishDailyRun;
  evaluate: (hotelId: string) => Promise<AutoPayoutOutcome>;
}

const defaultDeps: DailyPayoutDeps = {
  listDue: model.listDailyHotelsDue,
  claimRun: model.claimDailyRun,
  finishRun: model.finishDailyRun,
  evaluate: evaluateScheduledPayout,
};

export interface DailyPayoutSummary {
  enabled: boolean;
  localDate: string;
  localTime: string;
  due: number;
  claimed: number;
  initiated: number;
  belowThreshold: number;
  nothing: number;
  skipped: number;
  errors: number;
  notClaimed: number;
}

export async function runDailyPayouts(opts: { now?: Date; deps?: Partial<DailyPayoutDeps>; batch?: number } = {}): Promise<DailyPayoutSummary> {
  const deps = { ...defaultDeps, ...opts.deps };
  const now = opts.now ?? new Date();
  const localDate = businessDate(now);
  const localTime = businessTimeOfDay(now);
  const out: DailyPayoutSummary = {
    enabled: env.autoPayoutsEnabled,
    localDate,
    localTime,
    due: 0,
    claimed: 0,
    initiated: 0,
    belowThreshold: 0,
    nothing: 0,
    skipped: 0,
    errors: 0,
    notClaimed: 0,
  };
  // Same master switch as instant payouts: nothing moves (and no run is
  // recorded) until AUTO_PAYOUTS_ENABLED=true.
  if (!env.autoPayoutsEnabled) return out;

  const due = await deps.listDue(localDate, localTime, opts.batch ?? DAILY_RUN_BATCH);
  out.due = due.length;

  for (const hotel of due) {
    let runId: string | null = null;
    try {
      const run = await deps.claimRun(hotel.hotel_id, localDate, hotel.payout_time, {
        maxAttempts: DAILY_RUN_MAX_ATTEMPTS,
        retryAfterMinutes: DAILY_RUN_RETRY_AFTER_MINUTES,
        leaseMinutes: DAILY_RUN_LEASE_MINUTES,
      });
      if (!run) {
        out.notClaimed++; // another invocation holds it, it is settled for today, or attempts are exhausted
        continue;
      }
      runId = run.id;
      out.claimed++;

      const outcome = await deps.evaluate(hotel.hotel_id);
      switch (outcome.action) {
        case "initiated":
          out.initiated++;
          await deps.finishRun(run.id, "initiated", `payout ${outcome.payout.status}, KSh ${outcome.payout.amount}`, outcome.payout.id);
          break;
        case "below_threshold":
          out.belowThreshold++;
          await deps.finishRun(run.id, "below_threshold", `balance KSh ${outcome.balance} < ${outcome.threshold}; carried forward`, null);
          break;
        case "none":
          out.nothing++;
          await deps.finishRun(run.id, "nothing", "no unpaid earnings", null);
          break;
        case "skipped":
          // Mode changed since listing / hotel gone: settled, nothing to retry.
          if (outcome.reason === "not_daily_mode" || outcome.reason === "hotel_not_found") {
            out.nothing++;
            await deps.finishRun(run.id, "nothing", outcome.reason, null);
          } else {
            out.skipped++;
            await deps.finishRun(run.id, "skipped", outcome.reason, null);
            if (run.attempts >= DAILY_RUN_MAX_ATTEMPTS) {
              console.error("[dailyPayoutService] scheduled payout skipped for the last time today — needs attention", {
                hotelId: hotel.hotel_id,
                reason: outcome.reason,
              });
            }
          }
          break;
        case "disabled":
          out.skipped++;
          await deps.finishRun(run.id, "skipped", "disabled", null);
          break;
      }
    } catch (err) {
      out.errors++;
      console.error("[dailyPayoutService] hotel evaluation failed", { hotelId: hotel.hotel_id, error: (err as Error).message });
      if (runId) {
        await deps.finishRun(runId, "error", (err as Error).message, null).catch(() => {});
      }
    }
  }
  return out;
}
