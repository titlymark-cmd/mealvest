import crypto from "crypto";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/hotelPayoutModel";
import * as transferService from "./paystackTransferService";
import * as cyzoraPayouts from "./cyzoraPayoutService";
import * as notificationEvents from "./notificationEvents";

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

/**
 * The one function that actually moves money toward a hotel. Claims
 * every currently-redeemed-but-unpaid order for this hotel atomically
 * (see model.claimPendingOrdersForPayout — this is what makes a
 * second concurrent "Pay out" click a safe no-op rather than a double
 * payment), creates or reuses a Paystack transfer recipient, then
 * initiates one real transfer for the batch total.
 *
 * Never trusts the initiate-transfer response's status as final — a
 * transfer can still be "pending"/"otp" at this point even on
 * success; the true outcome is only ever decided later, by
 * verifyPayout() against Paystack's own record, exactly the same
 * principle as paymentService.activatePaymentIfNeeded.
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

  // Cyzora validates the destination and the KES 30 floor BEFORE any
  // orders are claimed — a rejection here leaves nothing to release.
  const cyzoraDestination = provider === "cyzora" ? cyzoraPayouts.buildCyzoraDestination(hotel.payment_details as any) : null;

  const reference = generatePayoutReference();
  const claimed = await model.claimPendingOrdersForPayout(hotelId, reference, adminUserId, provider);
  if (!claimed) {
    throw new ApiError(404, "NOTHING_TO_PAY_OUT", "This hotel has no redeemed orders awaiting payout right now.");
  }

  if (provider === "cyzora") {
    return triggerCyzoraPayout(claimed, cyzoraDestination!);
  }

  try {
    // Reuse a cached recipient code if this hotel already has one —
    // avoids re-registering the same phone number with Paystack on
    // every payout. A changed settlement method clears the cache (see
    // migration 038's own comment) so a stale recipient is never reused.
    let recipientCode = hotel.paystack_recipient_code;
    if (!recipientCode) {
      const created = await transferService.createRecipient(hotel.payment_details as any);
      recipientCode = created.recipientCode;
      await model.saveRecipientCode(hotelId, recipientCode);
    }

    const initiated = await transferService.initiateTransfer({
      recipientCode,
      amount: Number(claimed.amount),
      reference,
      reason: `MEALVEST payout — ${claimed.amount} KES`,
    });

    const status = initiated.status === "success" ? "successful" : initiated.status === "failed" ? "failed" : "processing";
    const updated = await model.updatePayoutAfterInitiate(claimed.id, {
      status,
      recipientCode,
      transferCode: initiated.transferCode,
    });

    if (status === "failed") {
      // Initiated and immediately failed (rare, but real) — release
      // the claimed orders so they're eligible for the next payout
      // attempt instead of being stuck "claimed" by a payout that
      // never actually paid them.
      await model.releaseClaimedOrders(claimed.id);
    }

    return updated;
  } catch (err) {
    // The claim already happened — a failed recipient/transfer call
    // must release those orders back to the unpaid pool, or they'd be
    // silently stuck forever under a payout that never moved money.
    await model.releaseClaimedOrders(claimed.id).catch(() => {});
    const failed = await model.updatePayoutAfterInitiate(claimed.id, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : "Unknown error",
    });
    return failed;
  }
}

/**
 * Cyzora half of triggerPayout: one POST /payouts for the batch total,
 * Idempotency-Key = our PO- reference. The response's status is never
 * treated as final (a payout can sit at requested/processing for a
 * while) — payout.paid / payout.failed webhooks finalize it via
 * applyCyzoraPayoutWebhook. Cyzora's payout id goes into
 * transfer_code, the column the webhook lookup matches on.
 */
async function triggerCyzoraPayout(
  claimed: model.HotelPayoutRow,
  destination: cyzoraPayouts.CyzoraDestination
): Promise<model.HotelPayoutRow> {
  try {
    const initiated = await cyzoraPayouts.createPayout({
      amount: Number(claimed.amount),
      reference: claimed.transfer_reference,
      destination,
      description: `MEALVEST payout — ${claimed.amount} KES`,
    });

    const status = cyzoraPayouts.mapCyzoraPayoutStatus(initiated.status);
    const updated = await model.updatePayoutAfterInitiate(claimed.id, {
      status,
      transferCode: initiated.payoutId,
    });
    if (status === "failed") {
      await model.releaseClaimedOrders(claimed.id);
    } else if (status === "successful") {
      notificationEvents.hotelPayoutStatusChanged(claimed.hotel_id, "successful", Number(claimed.amount));
    }
    return updated;
  } catch (err) {
    // Same contract as the Paystack branch: a claim already happened,
    // so a rejected payout call must hand those orders back to the
    // unpaid pool rather than leaving them stuck under a payout that
    // never moved money. Cyzora's Idempotency-Key means an eventual
    // retry with a NEW reference can't double-pay the old one either.
    await model.releaseClaimedOrders(claimed.id).catch(() => {});
    return model.updatePayoutAfterInitiate(claimed.id, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Applies a signature-verified Cyzora payout.paid / payout.failed
 * event. The controller has already checked X-Cyzora-Signature on
 * the raw bytes — that HMAC with the webhook secret is Cyzora's
 * documented proof of authenticity, and the only payout-status source
 * this integration has (a per-payout read endpoint isn't among the
 * documented calls this was built from, so there's nothing to
 * re-query; see TESTING.md). Idempotent: finalizePayoutStatus only
 * moves a row that's still 'processing', so a redelivered event is a
 * no-op, and a duplicate can never release orders twice or notify
 * twice.
 */
export async function applyCyzoraPayoutWebhook(
  eventName: string,
  cyzoraPayoutId: string
): Promise<model.HotelPayoutRow | null> {
  const payout = await model.getPayoutByProviderId("cyzora", cyzoraPayoutId);
  if (!payout) {
    // Either a payout this app never created, or the webhook beat
    // triggerCyzoraPayout's own transfer_code write (Cyzora can report
    // a test payout within milliseconds). Returning null makes the
    // controller answer 404, and Cyzora's 10s retry lands after the
    // row is written.
    console.warn("[hotelPayoutService.applyCyzoraPayoutWebhook] No hotel_payouts row for Cyzora payout id:", cyzoraPayoutId);
    return null;
  }
  if (payout.status === "pending") return null; // initiate response still being recorded — let Cyzora retry
  if (payout.status !== "processing") return payout; // already final — duplicate delivery

  const finalStatus = eventName === "payout.paid" ? "successful" : eventName === "payout.failed" ? "failed" : null;
  if (!finalStatus) return payout;

  const result = await model.finalizePayoutStatus(payout.id, finalStatus, finalStatus === "failed" ? "Cyzora reported payout.failed" : null);
  if (!result) return payout; // lost the race with a concurrent delivery — it already did the work
  if (finalStatus === "failed") {
    await model.releaseClaimedOrders(payout.id);
  }
  notificationEvents.hotelPayoutStatusChanged(payout.hotel_id, finalStatus, Number(payout.amount));
  return result;
}

/**
 * Re-checks a still-"processing" payout against Paystack's own
 * record. Safe to call repeatedly (idempotent via
 * model.finalizePayoutStatus's own WHERE status='processing' guard) —
 * called by an admin "Refresh status" action and, once wired, the
 * Paystack transfer.success/transfer.failed webhook.
 */
export async function verifyPayout(payoutId: string): Promise<model.HotelPayoutRow | null> {
  const payout = await model.getPayoutById(payoutId);
  if (!payout) throw new ApiError(404, "PAYOUT_NOT_FOUND", "No matching payout found.");
  if (payout.status !== "processing" || !payout.transfer_code) return payout;

  // Cyzora payouts finalize through signed payout.paid/payout.failed
  // webhooks (applyCyzoraPayoutWebhook) — there's no documented
  // per-payout read to poll here, so "Refresh" just returns the
  // current row for them.
  if (payout.provider === "cyzora") return payout;

  const verified = await transferService.verifyTransfer(payout.transfer_code);
  if (verified.status === "pending") return payout;

  const finalStatus = verified.status === "success" ? "successful" : "failed";
  const result = await model.finalizePayoutStatus(payoutId, finalStatus, verified.failureReason);
  if (finalStatus === "failed") {
    await model.releaseClaimedOrders(payoutId);
  }
  if (result) {
    notificationEvents.hotelPayoutStatusChanged(payout.hotel_id, finalStatus, Number(payout.amount));
  }
  return result ?? payout;
}
