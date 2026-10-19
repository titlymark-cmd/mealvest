import crypto from "crypto";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/hotelPayoutModel";
import * as transferService from "./paystackTransferService";
import * as cyzoraPayouts from "./cyzoraPayoutService";
import * as notificationEvents from "./notificationEvents";
import { classifyProviderSendError } from "./payoutOutcome";

export type PayoutProviderName = "paystack" | "cyzora";

/**
 * Which provider a NEW payout goes through — follows
 * PAYMENT_PROVIDER_DEFAULT, same switch the student payment endpoints
 * use, so a deployment is "on Cyzora" or "on Paystack" as a whole.
 * Existing payout rows keep the provider they were created with.
 */
export function activePayoutProvider(): PayoutProviderName {
  return env.paymentProviderDefault === "cyzora" ? "cyzora" : "paystack";
}

export function isPayoutConfigured(): boolean {
  return activePayoutProvider() === "cyzora" ? cyzoraPayouts.isCyzoraPayoutConfigured() : transferService.isPayoutConfigured();
}

/** Settlement methods the ACTIVE provider can pay automatically — what the admin payout screen's "supported" flag should reflect. */
export function isPayoutSupported(method: string): boolean {
  return activePayoutProvider() === "cyzora" ? cyzoraPayouts.isCyzoraPayoutSupported(method) : transferService.isPayoutSupported(method);
}

export function generatePayoutReference(): string {
  // PO- prefix (payout) distinct from MV- (student payments) so the
  // two kinds of Paystack reference are never confused when reading
  // either dashboard's transaction list.
  return `PO-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** How long after a send attempt an 'unknown' payout may be re-sent (same reference) if the provider has no record of it. */
export const UNKNOWN_RESEND_GRACE_MS = 5 * 60 * 1000;

function limits(): model.PayoutLimits {
  return { perPayoutMaxKes: env.payoutMaxAmountKes, dailyMaxKes: env.payoutDailyLimitKes };
}

function notifyFinal(row: model.HotelPayoutRow | null): void {
  if (row && (row.status === "successful" || row.status === "failed")) {
    notificationEvents.hotelPayoutStatusChanged(row.hotel_id, row.status, Number(row.amount));
  }
}

/**
 * The one function that starts moving money toward a hotel (H3).
 *
 *  1. Validates settlement details BEFORE claiming anything.
 *  2. Atomically claims every redeemed-but-unpaid order into ONE payout
 *     row with ONE stable reference (model.claimPendingOrdersForPayout).
 *     Over-limit payouts are created in 'review' and stop here.
 *  3. Sends it (submitPayout), where a timeout/5xx leaves the payout in
 *     'unknown' with its orders still claimed — never 'failed' — so it
 *     can only ever be reconciled under the SAME reference.
 */
export async function triggerPayout(hotelId: string, adminUserId: string): Promise<model.HotelPayoutRow> {
  const provider = activePayoutProvider();
  if (!isPayoutConfigured()) {
    throw new ApiError(503, "PAYOUT_NOT_CONFIGURED", `${provider === "cyzora" ? "Cyzora" : "Paystack"} is not configured on this server yet.`);
  }

  const hotel = await model.getHotelPaymentDetails(hotelId);
  if (!hotel || !hotel.payment_method) {
    throw new ApiError(404, "HOTEL_NOT_FOUND", "No settlement details found for this hotel.");
  }
  if (!isPayoutSupported(hotel.payment_method)) {
    throw new ApiError(
      400,
      "PAYOUT_METHOD_NOT_SUPPORTED",
      `Automated payout isn't available yet for this hotel's "${hotel.payment_method}" settlement method — pay it out manually for now.`
    );
  }
  // Cyzora validates the destination BEFORE any orders are claimed.
  if (provider === "cyzora") cyzoraPayouts.buildCyzoraDestination(hotel.payment_details as any);

  const reference = generatePayoutReference();
  const claimed = await model.claimPendingOrdersForPayout(hotelId, reference, adminUserId, provider, limits());
  if (!claimed) {
    throw new ApiError(404, "NOTHING_TO_PAY_OUT", "This hotel has no redeemed orders awaiting payout right now.");
  }
  if (claimed.status === "review") {
    return claimed; // held for an admin decision — nothing is sent
  }
  return submitPayout(claimed.id);
}

/**
 * Sends a 'pending' or 'approved' payout to its provider. Safe against
 * concurrent calls: model.markSubmitting lets exactly one caller move
 * the row to 'unknown' and send; the others just get the current row.
 */
export async function submitPayout(payoutId: string): Promise<model.HotelPayoutRow> {
  const payout = await model.getPayoutById(payoutId);
  if (!payout) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No matching payout found.");
  if (payout.status !== "pending" && payout.status !== "approved") return payout;

  const hotel = await model.getHotelPaymentDetails(payout.hotel_id);
  if (!hotel || !hotel.payment_method) {
    return (await model.transitionToFinal(payout.id, "failed", ["pending", "approved"], {
      failureReason: "No settlement details found for this hotel.",
    })) ?? payout;
  }

  // Pre-send steps move no money, so ANY failure here is a confirmed
  // failure: the payout is closed and its orders released.
  let recipientCode: string | null = null;
  let destination: cyzoraPayouts.CyzoraDestination | null = null;
  try {
    if (payout.provider === "cyzora") {
      destination = cyzoraPayouts.buildCyzoraDestination(hotel.payment_details as any);
    } else {
      recipientCode = hotel.paystack_recipient_code;
      if (!recipientCode) {
        const created = await transferService.createRecipient(hotel.payment_details as any);
        recipientCode = created.recipientCode;
        await model.saveRecipientCode(payout.hotel_id, recipientCode);
      }
    }
  } catch (err) {
    return (await model.transitionToFinal(payout.id, "failed", ["pending", "approved"], {
      failureReason: err instanceof Error ? err.message : "Could not prepare the payout.",
    })) ?? payout;
  }

  const sending = await model.markSubmitting(payout.id);
  if (!sending) {
    return (await model.getPayoutById(payout.id)) ?? payout; // someone else is sending it
  }
  return sendOnce(sending, { recipientCode, destination });
}

/**
 * One provider call for a payout that is already in 'unknown' (we own
 * the send). Always uses the payout's OWN transfer_reference as the
 * provider reference / Idempotency-Key.
 */
async function sendOnce(
  payout: model.HotelPayoutRow,
  ctx: { recipientCode: string | null; destination: cyzoraPayouts.CyzoraDestination | null }
): Promise<model.HotelPayoutRow> {
  const amount = Number(payout.amount);
  try {
    if (payout.provider === "cyzora") {
      const initiated = await cyzoraPayouts.createPayout({
        amount,
        reference: payout.transfer_reference,
        destination: ctx.destination!,
        description: `MEALVEST payout — ${payout.amount} KES`,
      });
      return await applySendResult(payout, cyzoraPayouts.mapCyzoraPayoutStatus(initiated.status), initiated.payoutId, null);
    }

    const initiated = await transferService.initiateTransfer({
      recipientCode: ctx.recipientCode!,
      amount,
      reference: payout.transfer_reference,
      reason: `MEALVEST payout — ${payout.amount} KES`,
    });
    const mapped = initiated.status === "success" ? "successful" : initiated.status === "failed" ? "failed" : "processing";
    return await applySendResult(payout, mapped, initiated.transferCode, ctx.recipientCode);
  } catch (err) {
    const classified = classifyProviderSendError(err, "PAYOUT_SEND_FAILED", "Could not send this payout.");
    if (classified.definite) {
      const row = await model.transitionToFinal(payout.id, "failed", ["unknown"], { failureReason: classified.message });
      notifyFinal(row);
      return row ?? (await model.getPayoutById(payout.id)) ?? payout;
    }
    console.warn("[hotelPayoutService] payout outcome UNKNOWN — will reconcile under the same reference", {
      payoutId: payout.id,
      reference: payout.transfer_reference,
      reason: classified.message,
    });
    return (await model.recordUnknownOutcome(payout.id, `Outcome unknown: ${classified.message}`)) ?? payout;
  }
}

async function applySendResult(
  payout: model.HotelPayoutRow,
  status: "processing" | "successful" | "failed",
  transferCode: string | null,
  recipientCode: string | null
): Promise<model.HotelPayoutRow> {
  if (status === "failed") {
    const row = await model.transitionToFinal(payout.id, "failed", ["unknown"], {
      failureReason: "Provider reported the payout as failed",
      transferCode,
    });
    notifyFinal(row);
    return row ?? payout;
  }
  const accepted = await model.recordSendAccepted(payout.id, { status, transferCode, recipientCode });
  if (status === "successful") notifyFinal(accepted);
  return accepted ?? (await model.getPayoutById(payout.id)) ?? payout;
}

/**
 * Applies a signature-verified Cyzora payout.paid / payout.failed event.
 * Idempotent: only a payout still awaiting its outcome ('processing' or
 * 'unknown') is moved, and orders are released at most once.
 */
export async function applyCyzoraPayoutWebhook(
  eventName: string,
  cyzoraPayoutId: string
): Promise<model.HotelPayoutRow | null> {
  const payout = await model.getPayoutByProviderId("cyzora", cyzoraPayoutId);
  if (!payout) {
    // A payout this app never created, or the webhook beat our own
    // transfer_code write — null makes the controller answer 404 and
    // Cyzora's retry lands after the row is written.
    console.warn("[hotelPayoutService.applyCyzoraPayoutWebhook] No hotel_payouts row for Cyzora payout id:", cyzoraPayoutId);
    return null;
  }
  if (payout.status !== "processing" && payout.status !== "unknown") return payout; // final already, or never sent

  const finalStatus = eventName === "payout.paid" ? "successful" : eventName === "payout.failed" ? "failed" : null;
  if (!finalStatus) return payout;

  const result = await model.transitionToFinal(payout.id, finalStatus, ["processing", "unknown"], {
    failureReason: finalStatus === "failed" ? "Cyzora reported payout.failed" : null,
  });
  if (!result) return (await model.getPayoutById(payout.id)) ?? payout; // lost a race with a duplicate delivery
  notifyFinal(result);
  return result;
}

/**
 * Re-checks an unresolved payout against the provider, under its OWN
 * reference. Used by the admin "Refresh status" action, the Paystack
 * transfer.* webhook and the reconciliation cron. Never creates a new
 * reference; never re-sends unless the provider has no record of the
 * reference AND the grace period has passed (and then only with the
 * same reference/idempotency key, which the provider deduplicates).
 */
export async function verifyPayout(payoutId: string): Promise<model.HotelPayoutRow | null> {
  const payout = await model.getPayoutById(payoutId);
  if (!payout) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No matching payout found.");
  if (payout.status !== "processing" && payout.status !== "unknown") return payout;

  if (payout.provider === "cyzora") {
    // Cyzora has no documented per-payout read: 'processing' payouts are
    // finalized by signed webhooks. An 'unknown' one is reconciled by
    // re-POSTing with the SAME Idempotency-Key, which returns the
    // original payout if it was created (or creates it exactly once).
    if (payout.status === "processing") {
      await model.touchReconciled(payout.id);
      return payout;
    }
    if (!graceElapsed(payout)) return payout;
    const hotel = await model.getHotelPaymentDetails(payout.hotel_id);
    let destination: cyzoraPayouts.CyzoraDestination;
    try {
      destination = cyzoraPayouts.buildCyzoraDestination((hotel?.payment_details ?? {}) as any);
    } catch (err) {
      return (await model.recordUnknownOutcome(payout.id, `Cannot reconcile: ${(err as Error).message}`)) ?? payout;
    }
    await model.recordResendAttempt(payout.id);
    return sendOnce(payout, { recipientCode: null, destination });
  }

  // Paystack
  let verified: transferService.VerifyTransferResult | null;
  try {
    verified = payout.transfer_code
      ? await transferService.verifyTransfer(payout.transfer_code)
      : await transferService.verifyTransferByReference(payout.transfer_reference);
  } catch (err) {
    await model.touchReconciled(payout.id);
    throw err;
  }

  if (!verified) {
    // Paystack has no transfer with our reference.
    if (payout.status !== "unknown" || !graceElapsed(payout)) return payout;
    const recipientCode = payout.recipient_code ?? (await model.getHotelPaymentDetails(payout.hotel_id))?.paystack_recipient_code ?? null;
    if (!recipientCode) {
      return (await model.recordUnknownOutcome(payout.id, "Cannot re-send: no Paystack recipient on file")) ?? payout;
    }
    await model.recordResendAttempt(payout.id);
    return sendOnce(payout, { recipientCode, destination: null });
  }

  if (verified.status === "pending") {
    if (payout.status === "unknown") {
      return (await model.recordSendAccepted(payout.id, { status: "processing", transferCode: verified.transferCode })) ?? payout;
    }
    await model.touchReconciled(payout.id);
    return payout;
  }

  const finalStatus = verified.status === "success" ? "successful" : "failed";
  const result = await model.transitionToFinal(payout.id, finalStatus, ["processing", "unknown"], {
    failureReason: verified.failureReason,
    transferCode: verified.transferCode,
  });
  notifyFinal(result);
  return result ?? (await model.getPayoutById(payout.id));
}

function graceElapsed(payout: model.HotelPayoutRow): boolean {
  const sentAt = payout.submitted_at ? new Date(payout.submitted_at).getTime() : new Date(payout.updated_at).getTime();
  return Date.now() - sentAt >= UNKNOWN_RESEND_GRACE_MS;
}

/**
 * review -> approved -> sent. Approval policy (M8): a payout held for
 * review (over PAYOUT_MAX_AMOUNT_KES, or pushing the day over
 * PAYOUT_DAILY_LIMIT_KES) must be approved by a DIFFERENT administrator
 * than the one who initiated it. Payouts within the limits are sent
 * directly by the initiating admin, as before.
 */
export async function approveAndSubmitPayout(payoutId: string, adminUserId: string): Promise<model.HotelPayoutRow> {
  const approved = await model.approvePayout(payoutId, adminUserId);
  if (!approved) {
    const current = await model.getPayoutById(payoutId);
    if (!current) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No matching payout found.");
    if (current.status === "review" && current.initiated_by_admin_id === adminUserId) {
      throw new ApiError(403, "DUAL_APPROVAL_REQUIRED", "Another administrator must approve a payout you initiated.");
    }
    throw new ApiError(409, "INVALID_TRANSITION", `This payout is ${current.status} and cannot be approved.`);
  }
  return submitPayout(approved.id);
}

/** Cancels a payout that was never sent (review/approved) and releases its orders. */
export async function cancelPayout(payoutId: string, adminUserId: string): Promise<model.HotelPayoutRow> {
  const row = await model.transitionToFinal(payoutId, "cancelled", ["review", "approved"], {
    adminId: adminUserId,
    failureReason: "Cancelled by an administrator before sending",
  });
  if (!row) {
    const current = await model.getPayoutById(payoutId);
    if (!current) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No matching payout found.");
    throw new ApiError(409, "INVALID_TRANSITION", `This payout is ${current.status} and cannot be cancelled.`);
  }
  return row;
}
