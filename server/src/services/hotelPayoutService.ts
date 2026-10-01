import crypto from "crypto";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/hotelPayoutModel";
import * as transferService from "./paystackTransferService";
import * as notificationEvents from "./notificationEvents";

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
  if (!transferService.isPayoutConfigured()) {
    throw new ApiError(503, "PAYOUT_NOT_CONFIGURED", "Paystack is not configured on this server yet.");
  }

  const hotel = await model.getHotelPaymentDetails(hotelId);
  if (!hotel || !hotel.payment_method) {
    throw new ApiError(404, "HOTEL_NOT_FOUND", "No settlement details found for this hotel.");
  }
  if (!transferService.isPayoutSupported(hotel.payment_method)) {
    throw new ApiError(
      400,
      "PAYOUT_METHOD_NOT_SUPPORTED",
      `Automated payout isn't available yet for this hotel's "${hotel.payment_method}" settlement method — pay it out manually for now.`
    );
  }

  const reference = generatePayoutReference();
  const claimed = await model.claimPendingOrdersForPayout(hotelId, reference, adminUserId);
  if (!claimed) {
    throw new ApiError(404, "NOTHING_TO_PAY_OUT", "This hotel has no redeemed orders awaiting payout right now.");
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
