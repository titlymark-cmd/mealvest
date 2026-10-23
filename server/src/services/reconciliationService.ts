import { pool } from "../config/db";
import { activatePaymentIfNeeded, PendingTransactionLookup } from "./paymentService";
import { verifyTransactionRow } from "./paymentVerification";
import * as payoutModel from "../models/hotelPayoutModel";
import { verifyPayout, submitPayout, sweepAutoPayouts } from "./hotelPayoutService";

/**
 * Reconciliation (findings H1 + H3). Second safety net behind
 * verify-polling and provider webhooks:
 *
 *  - payments: transactions the provider may have settled but that were
 *    never credited (activated_at IS NULL). Each is re-verified with the
 *    provider and passed through the same idempotent
 *    activatePaymentIfNeeded — an unpaid transaction can never be marked
 *    successful here, and no new charge is ever created.
 *  - payouts: 'unknown'/'processing' payouts, reconciled under their OWN
 *    reference (hotelPayoutService.verifyPayout). No new reference.
 *
 * Bounded batches; rows are leased (reconcile_claimed_until) with
 * FOR UPDATE SKIP LOCKED so overlapping cron runs never process the same
 * row concurrently. Every outcome is recorded on the row.
 */

export const PAYMENT_BATCH = 25;
export const PAYOUT_BATCH = 10;

export interface ReconcileSummary {
  payments: { examined: number; activated: number; stillPending: number; failed: number; errors: number; review: number };
  payouts: { examined: number; resolved: number; stillOpen: number; errors: number; sentStalePending: number; sweepInitiated: number };
}

export async function claimUnactivatedPayments(limit: number): Promise<PendingTransactionLookup[]> {
  const result = await pool.query<PendingTransactionLookup>(
    `UPDATE transactions SET reconcile_claimed_until = now() + interval '10 minutes'
      WHERE id IN (
        SELECT id FROM transactions
         WHERE activated_at IS NULL AND needs_review = false
           AND type IN ('budget_topup', 'plan_boost')
           AND status IN ('pending', 'processing', 'success')
           AND provider IN ('paystack', 'cyzora')
           AND created_at < now() - interval '2 minutes'
           AND created_at > now() - interval '7 days'
           AND (reconcile_claimed_until IS NULL OR reconcile_claimed_until < now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id, provider, provider_reference, provider_transaction_id, provider_channel, status, amount`,
    [limit]
  );
  return result.rows;
}

export async function reconcilePayments(limit = PAYMENT_BATCH): Promise<ReconcileSummary["payments"]> {
  const out = { examined: 0, activated: 0, stillPending: 0, failed: 0, errors: 0, review: 0 };
  const rows = await claimUnactivatedPayments(limit);
  for (const row of rows) {
    out.examined++;
    try {
      if (row.provider === "cyzora" && !row.provider_transaction_id) {
        // Initialize never got Cyzora's id back: nothing to verify against.
        out.stillPending++;
        continue;
      }
      const verified = await verifyTransactionRow(row);
      const result = await activatePaymentIfNeeded(row.provider_reference, verified);
      if (result.needsReview) out.review++;
      else if (result.status === "success") out.activated++;
      else if (result.status === "failed") out.failed++;
      else out.stillPending++;
    } catch (err) {
      out.errors++;
      // activatePaymentIfNeeded already recorded activation_error/attempts.
      console.error("[reconcilePayments] could not reconcile", { transactionId: row.id, error: (err as Error).message });
    }
  }
  return out;
}

export async function reconcilePayouts(limit = PAYOUT_BATCH): Promise<ReconcileSummary["payouts"]> {
  const out = { examined: 0, resolved: 0, stillOpen: 0, errors: 0, sentStalePending: 0, sweepInitiated: 0 };

  // 'pending' = claimed but never sent (process died after the claim).
  // No provider call has been made for these, so sending is safe; the
  // send claim (markSubmitting) still admits exactly one sender.
  for (const row of await payoutModel.claimStalePending(limit, 2)) {
    try {
      await submitPayout(row.id);
      out.sentStalePending++;
    } catch (err) {
      out.errors++;
      console.error("[reconcilePayouts] could not send stale pending payout", { payoutId: row.id, error: (err as Error).message });
    }
  }
  const rows = await payoutModel.claimForReconciliation(limit);
  for (const row of rows) {
    out.examined++;
    try {
      const after = await verifyPayout(row.id);
      if (after && (after.status === "successful" || after.status === "failed")) out.resolved++;
      else out.stillOpen++;
    } catch (err) {
      out.errors++;
      console.error("[reconcilePayouts] could not reconcile", { payoutId: row.id, error: (err as Error).message });
    }
  }

  // Catch-all for balances at/above the threshold that no trigger paid.
  try {
    out.sweepInitiated = (await sweepAutoPayouts(limit)).initiated;
  } catch (err) {
    out.errors++;
    console.error("[reconcilePayouts] auto-payout sweep failed", { error: (err as Error).message });
  }
  return out;
}

export async function runReconciliation(): Promise<ReconcileSummary> {
  return { payments: await reconcilePayments(), payouts: await reconcilePayouts() };
}
