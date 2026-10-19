import crypto from "crypto";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { createFundedBudget, applyBoostInTx, BudgetRow } from "./budgetService";
import { VerifyPaymentResult } from "./paymentProvider";
import * as notificationEvents from "./notificationEvents";

export function generatePaymentReference(): string {
  // MV- prefix makes these instantly recognizable as ours in the
  // Paystack dashboard, distinct from Daraja's CheckoutRequestID
  // format if both ever appear side by side later.
  return `MV-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export type PaymentProviderName = "paystack" | "daraja" | "cyzora";
export type PaymentChannel = "stk_push" | "hosted_checkout";

interface CreatePendingParams {
  userId: string;
  hotelId: string | null;
  amount: number;
  phoneNumber: string;
  provider: PaymentProviderName;
  reference: string;
  numberOfDays: number; // carried through so activation can create the right-length budget
  channel?: PaymentChannel; // Cyzora only — which verify endpoint this row belongs to (migration 040)
}

export async function createPendingTransaction(params: CreatePendingParams) {
  const result = await pool.query(
    `INSERT INTO transactions
       (user_id, hotel_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key, number_of_days, provider_channel)
     VALUES ($1, $2, $3, $4, 'budget_topup', 'pending', $5, $6, $6, $7, $8)
     RETURNING *`,
    [
      params.userId,
      params.hotelId,
      params.amount,
      params.phoneNumber,
      params.provider,
      params.reference,
      params.numberOfDays,
      params.channel ?? null,
    ]
  );
  return result.rows[0];
}

/**
 * Cyzora hands back ITS identifier (charge id for an STK push, session
 * reference for hosted checkout) at initialize time, and every later
 * read of that payment is keyed by it — so it's stored the moment the
 * initialize call returns, into the same provider_transaction_id
 * column Paystack rows fill in at verify time. Status is deliberately
 * NOT touched here: a created charge/session is still 'pending'.
 */
export async function recordProviderTransactionId(reference: string, providerTransactionId: string): Promise<void> {
  await pool.query(
    "UPDATE transactions SET provider_transaction_id = $1, updated_at = now() WHERE provider_reference = $2",
    [providerTransactionId, reference]
  );
}

export interface PendingTransactionLookup {
  id: string;
  user_id: string;
  provider: PaymentProviderName;
  provider_reference: string; // ours (MV-…)
  provider_transaction_id: string | null;
  provider_channel: PaymentChannel | null;
  status: string;
  amount: string;
}

/** The handful of columns verify/webhook handlers need to pick the right provider + endpoint for an existing payment. */
export async function findTransactionByReference(reference: string): Promise<PendingTransactionLookup | null> {
  const result = await pool.query<PendingTransactionLookup>(
    `SELECT id, user_id, provider, provider_reference, provider_transaction_id, provider_channel, status, amount
     FROM transactions WHERE provider_reference = $1`,
    [reference]
  );
  return result.rows[0] ?? null;
}

/** Webhooks are keyed by Cyzora's own id/reference, not our MV- reference — this is the reverse lookup (index from migration 040). */
export async function findTransactionByProviderTransactionId(
  provider: PaymentProviderName,
  providerTransactionId: string
): Promise<PendingTransactionLookup | null> {
  const result = await pool.query<PendingTransactionLookup>(
    `SELECT id, user_id, provider, provider_reference, provider_transaction_id, provider_channel, status, amount
     FROM transactions WHERE provider = $1 AND provider_transaction_id = $2`,
    [provider, providerTransactionId]
  );
  return result.rows[0] ?? null;
}

interface CreatePendingBoostParams {
  userId: string;
  budgetId: string;
  amount: number;
  phoneNumber: string;
  provider: PaymentProviderName;
  reference: string;
  channel?: PaymentChannel;
}

/**
 * Same shape as createPendingTransaction but type='plan_boost' and
 * carries budget_id — the one thing activatePaymentIfNeeded needs to
 * know WHICH budget to credit once this reference is verified paid.
 */
export async function createPendingBoostTransaction(params: CreatePendingBoostParams) {
  const result = await pool.query(
    `INSERT INTO transactions
       (user_id, budget_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key, provider_channel)
     VALUES ($1, $2, $3, $4, 'plan_boost', 'pending', $5, $6, $6, $7)
     RETURNING *`,
    [params.userId, params.budgetId, params.amount, params.phoneNumber, params.provider, params.reference, params.channel ?? null]
  );
  return result.rows[0];
}

export const EXPECTED_CURRENCY = "KES";

export interface ActivationResult {
  alreadyProcessed: boolean;
  transactionId: string;
  /** The ledger status after this call ('success' | 'processing' | 'failed' | …). */
  status: string;
  /** True when money was confirmed but could not be credited automatically (kept for admin review, never lost). */
  needsReview?: boolean;
}

/** Exact cent comparison — never compare floating KSh values directly. */
export function amountsMatch(providerAmountKes: number, expectedAmountKes: number): boolean {
  if (!Number.isFinite(providerAmountKes) || !Number.isFinite(expectedAmountKes)) return false;
  return Math.round(providerAmountKes * 100) === Math.round(expectedAmountKes * 100);
}

/**
 * The ONE function that turns a provider-verified payment into budget
 * credit — called by /verify (student polling), the provider webhooks
 * and the reconciliation cron, in any order and any number of times.
 *
 * Security finding H1: previously the 'success' flip was COMMITTED
 * first and the budget was created afterwards on other connections, so
 * any failure in between left a paid transaction with no budget, and
 * the idempotency guard then skipped it forever. Now everything —
 * status flip, budget creation/credit, budget linkage and the
 * activated_at marker — happens in ONE database transaction on ONE
 * client. Either all of it commits, or none of it does and the row
 * stays retryable (webhook 5xx → provider retry; reconciliation cron).
 *
 * Idempotency: the transaction row is locked FOR UPDATE and
 * `activated_at` is the "already credited" marker, so concurrent or
 * repeated calls credit at most once. A budget_topup can additionally
 * only ever fund one budget (migration 043 unique index + trigger).
 *
 * `verified` must come from the provider's own API (or a signature-
 * verified webhook re-checked against the API) — never from a browser.
 */
export async function activatePaymentIfNeeded(reference: string, verified: VerifyPaymentResult): Promise<ActivationResult> {
  if (verified.reference !== reference) {
    // Programming/provider error — refuse rather than credit the wrong row.
    throw new ApiError(500, "REFERENCE_MISMATCH", "Verified payment reference does not match the transaction.");
  }

  const client = await pool.connect();
  let txId: string | null = null;
  const afterCommit: Array<() => void> = [];
  try {
    await client.query("BEGIN");

    const txResult = await client.query("SELECT * FROM transactions WHERE provider_reference = $1 FOR UPDATE", [reference]);
    if (txResult.rows.length === 0) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching transaction found for this reference.");
    }
    const tx = txResult.rows[0];
    txId = tx.id;

    // ---- IDEMPOTENCY GUARD ----
    if (tx.activated_at) {
      await client.query("COMMIT");
      return { alreadyProcessed: true, transactionId: tx.id, status: tx.status };
    }
    if (tx.needs_review) {
      // A human is already looking at this one; never auto-credit it.
      await client.query("COMMIT");
      return { alreadyProcessed: true, transactionId: tx.id, status: tx.status, needsReview: true };
    }
    if (tx.type !== "budget_topup" && tx.type !== "plan_boost") {
      throw new ApiError(409, "UNSUPPORTED_TRANSACTION_TYPE", "This transaction type cannot be activated.");
    }

    if (verified.status !== "success") {
      if (tx.status === "success") {
        // We previously recorded the provider's confirmation but the
        // provider now disagrees. Never downgrade money we may have
        // received; park it for a human.
        await client.query(
          `UPDATE transactions SET needs_review = true,
             activation_error = 'Provider status changed after success was recorded', updated_at = now()
           WHERE id = $1`,
          [tx.id]
        );
        await client.query("COMMIT");
        return { alreadyProcessed: false, transactionId: tx.id, status: tx.status, needsReview: true };
      }
      const newStatus = verified.status === "pending" ? "processing" : "failed";
      await client.query(
        "UPDATE transactions SET status = $1, provider_transaction_id = COALESCE($2, provider_transaction_id), updated_at = now() WHERE id = $3",
        [newStatus, verified.providerTransactionId || null, tx.id]
      );
      await client.query("COMMIT");
      // Only a real, final "failed" notifies — "pending" (STK push still awaiting PIN) is not a failure.
      if (verified.status === "failed" && tx.status !== "failed") {
        notificationEvents.paymentFailed(tx.user_id, Number(tx.amount), reference);
      }
      return { alreadyProcessed: false, transactionId: tx.id, status: newStatus };
    }

    // ---- Provider says success: validate it is THIS payment, in full ----
    const currency = String(verified.currency || "").toUpperCase();
    if (currency !== EXPECTED_CURRENCY || !amountsMatch(verified.amount, Number(tx.amount))) {
      // Permanent problem: record it (committed) for manual review and
      // never credit. The money, if any, is visible to admins.
      await client.query(
        `UPDATE transactions
           SET status = 'failed', needs_review = true,
               result_description = 'Amount/currency mismatch — flagged for review',
               activation_error = $2, updated_at = now()
         WHERE id = $1`,
        [tx.id, `expected ${tx.amount} ${EXPECTED_CURRENCY}, provider reported ${verified.amount} ${currency || "?"}`]
      );
      await client.query("COMMIT");
      throw new ApiError(409, "AMOUNT_MISMATCH", "Paid amount did not match the expected amount.");
    }

    // Status flips first (same DB transaction) — migration 043's trigger
    // requires a 'success' funding transaction for a new budget.
    await client.query(
      `UPDATE transactions SET status = 'success', provider_transaction_id = COALESCE($1, provider_transaction_id), updated_at = now()
       WHERE id = $2`,
      [verified.providerTransactionId || null, tx.id]
    );

    // Serialize all budget creation/credit for this student, so two
    // different payments activating at the same moment can't both
    // create an "only" active budget.
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [tx.user_id]);

    const amount = Number(tx.amount);
    let credited: BudgetRow | null = null;
    let isBoost = tx.type === "plan_boost";

    if (tx.type === "plan_boost" && tx.budget_id) {
      credited = await applyBoostInTx(client, tx.budget_id, amount);
    }
    if (!credited) {
      // A new-plan payment, or a boost whose target plan is no longer
      // active (e.g. it ended and was withdrawn while the student was
      // paying). Credit the student's CURRENT active plan if they have
      // one — money is never silently dropped.
      const active = await client.query<{ id: string }>(
        "SELECT id FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
        [tx.user_id]
      );
      if (active.rows[0]) {
        credited = await applyBoostInTx(client, active.rows[0].id, amount);
        isBoost = true;
      } else if (tx.type === "budget_topup") {
        credited = await createFundedBudget(client, {
          userId: tx.user_id,
          fundingTransactionId: tx.id,
          totalAmount: amount,
          numberOfDays: tx.number_of_days || 30,
          hotelId: tx.hotel_id,
        });
        isBoost = false;
      }
    }

    if (!credited) {
      // A paid boost with no plan to credit at all. Keep the confirmed
      // payment, mark it for review, do NOT activate.
      await client.query(
        `UPDATE transactions SET needs_review = true,
           activation_error = 'Paid boost has no active plan to credit', updated_at = now()
         WHERE id = $1`,
        [tx.id]
      );
      await client.query("COMMIT");
      console.error("[activatePaymentIfNeeded] Paid boost has no active plan to credit — flagged for review", { transactionId: tx.id });
      return { alreadyProcessed: false, transactionId: tx.id, status: "success", needsReview: true };
    }

    await client.query(
      `UPDATE transactions
         SET activated_at = now(), budget_id = $2, activation_error = NULL, updated_at = now()
       WHERE id = $1`,
      [tx.id, credited.id]
    );

    await client.query("COMMIT");

    // Side effects only after the money is durably credited.
    afterCommit.push(() => notificationEvents.paymentSuccess(tx.user_id, amount, reference, isBoost));
    afterCommit.forEach((fn) => fn());
    return { alreadyProcessed: false, transactionId: tx.id, status: "success" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Best-effort bookkeeping OUTSIDE the rolled-back transaction so the
    // reconciliation cron and admins can see repeated failures.
    if (txId && !(err instanceof ApiError && err.code === "AMOUNT_MISMATCH")) {
      await pool
        .query(
          "UPDATE transactions SET activation_attempts = activation_attempts + 1, activation_error = $2 WHERE id = $1 AND activated_at IS NULL",
          [txId, String((err as Error)?.message ?? err).slice(0, 500)]
        )
        .catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}
