import crypto from "crypto";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { createBudget, applyBoost } from "./budgetService";
import { VerifyPaymentResult } from "./paymentProvider";

export function generatePaymentReference(): string {
  // MV- prefix makes these instantly recognizable as ours in the
  // Paystack dashboard, distinct from Daraja's CheckoutRequestID
  // format if both ever appear side by side later.
  return `MV-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

interface CreatePendingParams {
  userId: string;
  hotelId: string | null;
  amount: number;
  phoneNumber: string;
  provider: "paystack" | "daraja";
  reference: string;
  numberOfDays: number; // carried through so activation can create the right-length budget
}

export async function createPendingTransaction(params: CreatePendingParams) {
  const result = await pool.query(
    `INSERT INTO transactions
       (user_id, hotel_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key, number_of_days)
     VALUES ($1, $2, $3, $4, 'budget_topup', 'pending', $5, $6, $6, $7)
     RETURNING *`,
    [params.userId, params.hotelId, params.amount, params.phoneNumber, params.provider, params.reference, params.numberOfDays]
  );
  return result.rows[0];
}

interface CreatePendingBoostParams {
  userId: string;
  budgetId: string;
  amount: number;
  phoneNumber: string;
  provider: "paystack" | "daraja";
  reference: string;
}

/**
 * Same shape as createPendingTransaction but type='plan_boost' and
 * carries budget_id — the one thing activatePaymentIfNeeded needs to
 * know WHICH budget to credit once this reference is verified paid.
 */
export async function createPendingBoostTransaction(params: CreatePendingBoostParams) {
  const result = await pool.query(
    `INSERT INTO transactions
       (user_id, budget_id, amount, phone_number, type, status, provider, provider_reference, idempotency_key)
     VALUES ($1, $2, $3, $4, 'plan_boost', 'pending', $5, $6, $6)
     RETURNING *`,
    [params.userId, params.budgetId, params.amount, params.phoneNumber, params.provider, params.reference]
  );
  return result.rows[0];
}

/**
 * The ONE function that turns a verified successful payment into an
 * active budget — called by both /verify (student polling after
 * checkout) and /webhooks/paystack (Paystack's own notification).
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
    if (tx.status === "success" || tx.status === "failed") {
      await client.query("COMMIT");
      return { alreadyProcessed: true, transactionId: tx.id };
    }

    if (verified.status !== "success") {
      await client.query(
        "UPDATE transactions SET status = $1, provider_transaction_id = $2, updated_at = now() WHERE id = $3",
        [verified.status === "pending" ? "processing" : "failed", verified.providerTransactionId, tx.id]
      );
      await client.query("COMMIT");
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

    return { alreadyProcessed: false, transactionId: tx.id };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
