import axios from "axios";
import crypto from "crypto";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import {
  PaymentProvider,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from "./paymentProvider";

function client() {
  if (!env.paystackSecretKey) {
    throw new ApiError(
      500,
      "PAYSTACK_NOT_CONFIGURED",
      "Paystack is not configured on this server yet. Set PAYSTACK_SECRET_KEY in .env."
    );
  }
  return axios.create({
    baseURL: env.paystackBaseUrl,
    headers: { Authorization: `Bearer ${env.paystackSecretKey}`, "Content-Type": "application/json" },
  });
}

function mapPaystackStatus(status: string): VerifyPaymentResult["status"] {
  if (status === "success") return "success";
  if (status === "failed" || status === "reversed") return "failed";
  // "abandoned" is deliberately NOT treated as a hard failure here.
  // For the mobile_money/M-Pesa channel, Paystack commonly reports
  // "abandoned" transiently while a charge is still awaiting the
  // customer's STK-push PIN entry — not only once they've genuinely
  // given up — and it can still resolve to "success" moments later.
  // Collapsing it into "failed" let a payment that succeeds shortly
  // after get permanently misclassified, because
  // activatePaymentIfNeeded's idempotency guard treats "failed" the
  // same as a done deal and never re-checks. Mapping it to "pending"
  // keeps polling/the webhook able to catch the real outcome; a
  // genuinely abandoned checkout just times out on the frontend's own
  // poll limit instead of being falsely reported as failed.
  return "pending"; // "abandoned", "pending", "ongoing", "queued", etc.
}

export class PaystackPaymentProvider implements PaymentProvider {
  /**
   * Charge API (/charge), not /transaction/initialize — this sends an
   * M-Pesa STK push straight to the student's phone instead of
   * returning a hosted-checkout authorization_url to redirect to.
   * There's no checkout page to visit at all: the student enters their
   * M-Pesa PIN on the STK prompt itself, and the frontend polls
   * verifyPayment (below, via GET /transaction/verify) until Paystack
   * confirms it — same verification path as before, only how the
   * charge gets INITIATED changed. Works identically in test and live
   * mode (Paystack's test mode simulates the STK push/PIN entry), so
   * nothing here needs to change when live keys go in later.
   */
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    try {
      const res = await client().post("/charge", {
        email: params.email,
        // Paystack amounts are in the currency's smallest subunit —
        // for KES that's cents, so whole-KSh amounts are x100 here.
        // This conversion happens ONLY at the Paystack boundary; every
        // other part of this codebase (transactions table, budgets,
        // API responses) keeps working in whole KSh, unchanged.
        amount: Math.round(params.amount * 100),
        currency: "KES",
        reference: params.reference,
        mobile_money: {
          // Paystack's Charge API requires E.164 with a leading "+"
          // (confirmed via a real test call — bare "254XXXXXXXXX" gets
          // rejected as "Invalid phone number format"). Every other
          // part of this codebase keeps the "+"-less 254XXXXXXXXX form
          // (DB storage, uniqueness checks, display) — this prefix is
          // added ONLY at the Paystack API boundary, same pattern as
          // the amount->subunit conversion above.
          phone: `+${params.phoneNumber}`,
          provider: "mpesa",
        },
        metadata: { userId: params.userId, phoneNumber: params.phoneNumber, ...params.metadata },
      });

      const data = res.data.data;
      return {
        reference: params.reference,
        providerReference: data.reference,
        displayText: data.display_text || "Enter your M-Pesa PIN on your phone to complete payment.",
        raw: res.data,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Known Paystack quirk on the mobile_money Charge flow: a
        // charge that was genuinely created (async/pending on their
        // side) can still come back wrapped in a non-2xx HTTP status
        // with a generic body like {"message":"Charge attempted"} —
        // the actual charge sub-object (data.data) is still present
        // when that happens. Discarding it and hard-failing here would
        // mean a real pending payment is reported to the student as
        // "failed" even though the STK push may still land on their
        // phone. If Paystack gave us a real charge object, treat it as
        // a successful initiation regardless of the wrapping status
        // code — the true outcome is still decided later, by
        // verifyPayment() against Paystack's own transaction record,
        // never by this response alone.
        const errData = err.response?.data?.data;
        if (errData?.reference) {
          console.warn(
            "[paystackProvider.initializePayment] Non-2xx from Paystack but a charge object was returned — treating as initiated.",
            { status: err.response?.status, reference: errData.reference, chargeStatus: errData.status }
          );
          return {
            reference: params.reference,
            providerReference: errData.reference,
            displayText: errData.display_text || "Enter your M-Pesa PIN on your phone to complete payment.",
            raw: err.response?.data,
          };
        }

        // Genuine failure — log the full body server-side (safe: it's
        // Paystack's own response, never our secret key) so a report
        // like "Charge attempted" with no other context never needs
        // guessing at again.
        console.error("[paystackProvider.initializePayment] Paystack rejected the charge:", {
          status: err.response?.status,
          body: err.response?.data,
        });
        throw new ApiError(
          502,
          "PAYSTACK_INIT_FAILED",
          err.response?.data?.message || "Could not start payment with Paystack. Please try again."
        );
      }
      throw err;
    }
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    try {
      const res = await client().get(`/transaction/verify/${encodeURIComponent(reference)}`);
      const data = res.data.data;

      // Paystack's own decline/outcome reason — safe to log (no
      // secrets, just their transaction metadata) and otherwise
      // invisible to us, since activatePaymentIfNeeded only persists
      // our own status enum, not Paystack's free-text explanation.
      if (data.status !== "success") {
        console.warn("[paystackProvider.verifyPayment] Non-success from Paystack:", {
          reference,
          paystackStatus: data.status,
          gatewayResponse: data.gateway_response,
          channel: data.channel,
          message: res.data.message,
        });
      }

      return {
        reference,
        status: mapPaystackStatus(data.status),
        amount: data.amount / 100, // subunits back to whole KSh
        currency: data.currency,
        providerTransactionId: String(data.id),
        paidAt: data.paid_at || null,
        raw: res.data,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching Paystack transaction found for this reference.");
      }
      throw new ApiError(502, "PAYSTACK_VERIFY_FAILED", "Could not verify this payment with Paystack.");
    }
  }

  /**
   * Verifies Paystack's webhook signature (HMAC-SHA512 of the raw
   * body using the secret key) BEFORE trusting anything in the
   * payload — an attacker who doesn't know the secret key cannot
   * produce a valid signature no matter what JSON they send.
   *
   * Then, per spec, does NOT trust the webhook body for the actual
   * success determination either — it re-verifies with Paystack's
   * own API (a second, independent source of truth) rather than
   * marking a payment successful purely because a webhook claimed so.
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<VerifyPaymentResult> {
    if (!env.paystackSecretKey) {
      throw new ApiError(500, "PAYSTACK_NOT_CONFIGURED", "Paystack is not configured on this server yet.");
    }
    if (!signatureHeader) {
      throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing Paystack signature header.");
    }

    const expectedSignature = crypto.createHmac("sha512", env.paystackSecretKey).update(rawBody).digest("hex");

    // Timing-safe comparison — a naive `===` on signatures is a
    // (minor but real) timing side-channel.
    const sigBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Paystack webhook signature verification failed.");
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const reference = event?.data?.reference;
    if (!reference) {
      throw new ApiError(400, "INVALID_WEBHOOK_PAYLOAD", "Webhook payload did not include a transaction reference.");
    }

    // Independent re-verification, not a trust of event.data.status.
    return this.verifyPayment(reference);
  }

  async getPaymentStatus(reference: string): Promise<VerifyPaymentResult["status"]> {
    const result = await this.verifyPayment(reference);
    return result.status;
  }
}

export const paystackProvider = new PaystackPaymentProvider();
