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
  if (status === "failed" || status === "abandoned" || status === "reversed") return "failed";
  return "pending"; // "pending", "ongoing", "queued", etc.
}

export class PaystackPaymentProvider implements PaymentProvider {
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    try {
      const res = await client().post("/transaction/initialize", {
        email: params.email,
        // Paystack amounts are in the currency's smallest subunit —
        // for KES that's cents, so whole-KSh amounts are x100 here.
        // This conversion happens ONLY at the Paystack boundary; every
        // other part of this codebase (transactions table, budgets,
        // API responses) keeps working in whole KSh, unchanged.
        amount: Math.round(params.amount * 100),
        currency: "KES",
        reference: params.reference,
        channels: ["mobile_money", "card"], // Kenyan M-Pesa arrives via Paystack's mobile_money channel
        metadata: { userId: params.userId, phoneNumber: params.phoneNumber, ...params.metadata },
      });

      const data = res.data.data;
      return {
        reference: params.reference,
        providerReference: data.reference,
        checkoutUrl: data.authorization_url,
        raw: res.data,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
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
