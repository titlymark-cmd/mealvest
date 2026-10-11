import crypto from "crypto";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { createBudget, applyBoost } from "./budgetService";
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

/**
 * The ONE function that turns a verified successful payment into an
 * active budget — called by /verify (student polling after
 * checkout) and by the provider webhooks (/webhooks/paystack,
 * /webhooks/cyzora), whichever provider the row was created with.
 * Whichever one runs first does the activation; the other is a
 * guaranteed no-op. This is what makes double-crediting impossible
 * regardless of which order verify-polling and the webhook arrive in,
 * or whether both fire for the same payment.
 */
export async function activatePaymentIfNeeded(
  reference: string,
  verified: VerifyPaymentResult
): Promise<{ alreadyProcessed: boolean; transactionId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Row-level lock: if verify() and the webhook race each other in
    // true parallel, the second one blocks here until the first
    // commits, then sees status already flipped to 'success' and
    // exits via the idempotency guard below — never both proceeding
    // to activate at once.
    const txResult = await client.query(
      "SELECT * FROM transactions WHERE provider_reference = $1 FOR UPDATE",
      [reference]
    );
    if (txResult.rows.length === 0) {
      throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching transaction found for this reference.");
    }
    const tx = txResult.rows[0];

    // ---- IDEMPOTENCY GUARD ----
    // Only "success" is truly terminal here — it's the one state
    // where money has definitely moved and a budget has already been
    // created/credited, so re-entering this function for it must be a
    // safe no-op. "failed" is deliberately NOT short-circuited: a
    // status that looked like a failure at one poll (e.g. Paystack's
    // "abandoned" for an M-Pesa STK push still awaiting PIN entry,
    // mapped to "pending" upstream, or even a genuine transient
    // failure) can still resolve to "success" on a later poll or
    // webhook delivery. Locking "failed" as permanent as "success"
    // would let a payment that actually succeeds never get credited —
    // this is what previously made a false-failure unrecoverable.
    if (tx.status === "success") {
      await client.query("COMMIT");
      return { alreadyProcessed: true, transactionId: tx.id };
    }

    if (verified.status !== "success") {
      await client.query(
        "UPDATE transactions SET status = $1, provider_transaction_id = $2, updated_at = now() WHERE id = $3",
        [verified.status === "pending" ? "processing" : "failed", verified.providerTransactionId, tx.id]
      );
      await client.query("COMMIT");
      // Only a real, final "failed" — "pending" (STK push still awaiting
      // PIN entry, etc.) is not a failure and shouldn't notify anyone yet.
      if (verified.status === "failed") {
        notificationEvents.paymentFailed(tx.user_id, Number(tx.amount), reference);
      }
      return { alreadyProcessed: false, transactionId: tx.id };
    }

    // ---- Amount/currency cross-check — never trust the webhook or
    // even our own initialize-time amount blindly; use what Paystack
    // itself reports as authoritative for what was actually paid. ----
    if (Math.round(verified.amount) !== Math.round(Number(tx.amount))) {
      await client.query(
        "UPDATE transactions SET status = 'failed', result_description = 'Amount mismatch — flagged for review', updated_at = now() WHERE id = $1",
        [tx.id]
      );
      await client.query("COMMIT");
      throw new ApiError(409, "AMOUNT_MISMATCH", "Paid amount did not match the expected amount.");
    }

    await client.query(
      `UPDATE transactions
       SET status = 'success', provider_transaction_id = $1, updated_at = now()
       WHERE id = $2`,
      [verified.providerTransactionId, tx.id]
    );

    await client.query("COMMIT");

    // Budget creation/crediting happens OUTSIDE the transactions-table
    // transaction on purpose — both createBudget and applyBoost have
    // their own internal checks and their own atomic update; nesting
    // either inside this one risks a harder-to-reason-about combined
    // transaction for no real benefit, since the payment being marked
    // 'success' is already durably committed by now.
    if (tx.type === "plan_boost") {
      // A boost tops up a budget the student already has and already
      // accepted terms for at plan creation — nothing new to collect
      // here, just credit the referenced budget.
      await applyBoost(tx.budget_id, Number(tx.amount));
      notificationEvents.paymentSuccess(tx.user_id, Number(tx.amount), reference, true);
    } else {
      // A "new plan" top-up can still land here while the student
      // already has an active budget — e.g. a retried checkout after
      // an earlier attempt that looked failed/abandoned client-side
      // but actually settled, or simply paying twice by mistake.
      // createBudget() rejects that (ACTIVE_BUDGET_EXISTS) since a
      // student can only ever have one active plan — but by the time
      // we're here, the payment is ALREADY durably committed as
      // 'success' a few lines up. Letting createBudget's rejection
      // propagate used to mean real, successfully-charged money simply
      // vanished: no budget created, nothing credited, and the error
      // was silently swallowed by the webhook handler. Crediting it
      // into the existing active budget instead (exactly like a boost)
      // means a student's money is never lost to this, whichever path
      // triggered the payment.
      const existing = await pool.query("SELECT id FROM budgets WHERE user_id = $1 AND status = 'active' LIMIT 1", [
        tx.user_id,
      ]);
      if (existing.rows.length > 0) {
        await applyBoost(existing.rows[0].id, Number(tx.amount));
      } else {
        await createBudget({
          userId: tx.user_id,
          totalAmount: Number(tx.amount),
          numberOfDays: tx.number_of_days || 30,
          hotelId: tx.hotel_id,
          // Already required and validated at POST /payments/paystack/initialize
          // (initializeSchema.termsAccepted) — this payment could not have
          // been initiated at all without it, so it's safe to assert true
          // here rather than re-collecting it at activation time (which
          // happens via webhook/verify, where there is no user present to
          // ask).
          termsAccepted: true,
        });
      }
      notificationEvents.paymentSuccess(tx.user_id, Number(tx.amount), reference, false);
    }

    return { alreadyProcessed: false, transactionId: tx.id };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
