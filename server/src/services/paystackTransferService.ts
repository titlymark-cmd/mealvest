import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

function client() {
  if (!env.paystackSecretKey) {
    throw new ApiError(500, "PAYSTACK_NOT_CONFIGURED", "Paystack is not configured on this server yet.");
  }
  return axios.create({
    baseURL: env.paystackBaseUrl,
    headers: { Authorization: `Bearer ${env.paystackSecretKey}`, "Content-Type": "application/json" },
  });
}

/**
 * Settlement methods this V1 can pay out to automatically — every one
 * of them is ultimately "an M-Pesa-registered phone number," which is
 * what Paystack's Kenya mobile_money transfer recipient type actually
 * sends to. `paybill` and `bank` are real settlement methods a hotel
 * can register (settlementMethodSchema.ts), but neither maps cleanly
 * to a phone-number recipient — paybill's business/account number
 * isn't an MSISDN, and Kenya bank transfers need a different Paystack
 * recipient type this hasn't been verified against. Rather than guess
 * a shape that could silently send money to the wrong place, those
 * two report NOT_SUPPORTED and need a manual payout for now.
 */
const SUPPORTED_METHODS = ["mpesa_till", "send_money", "pochi_la_biashara"] as const;
type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

interface HotelPaymentDetails {
  method: string;
  registeredPhoneNumber?: string; // mpesa_till, paybill
  phoneNumber?: string; // send_money
  pochiPhoneNumber?: string; // pochi_la_biashara
  accountHolderName?: string; // send_money
  tillName?: string; // mpesa_till
  businessAccountName?: string; // pochi_la_biashara
}

export function isPayoutSupported(method: string): method is SupportedMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method);
}

/** Pulls the one phone number + display name each supported settlement method actually stores, per registerHotelSchema/settlementMethodSchema. */
function extractRecipientDetails(details: HotelPaymentDetails): { phoneNumber: string; name: string } {
  switch (details.method as SupportedMethod) {
    case "mpesa_till":
      return { phoneNumber: details.registeredPhoneNumber!, name: details.tillName || "MEALVEST Hotel Partner" };
    case "send_money":
      return { phoneNumber: details.phoneNumber!, name: details.accountHolderName || "MEALVEST Hotel Partner" };
    case "pochi_la_biashara":
      return { phoneNumber: details.pochiPhoneNumber!, name: details.businessAccountName || "MEALVEST Hotel Partner" };
  }
}

export interface CreateRecipientResult {
  recipientCode: string;
}

/**
 * Creates (never looks up/reuses on Paystack's side — callers cache
 * the returned code themselves, see hotels.paystack_recipient_code)
 * a Paystack transfer recipient for a hotel's phone-number-based
 * settlement method. Kenya mobile money: type "mobile_money",
 * bank_code "MPESA" (Kenya's only mobile-money bank_code on
 * Paystack), account_number = the phone number.
 */
export async function createRecipient(details: HotelPaymentDetails): Promise<CreateRecipientResult> {
  if (!isPayoutSupported(details.method)) {
    throw new ApiError(
      400,
      "PAYOUT_METHOD_NOT_SUPPORTED",
      `Automated payout isn't set up yet for the "${details.method}" settlement method — this hotel needs a manual payout for now.`
    );
  }
  const { phoneNumber, name } = extractRecipientDetails(details);

  try {
    const res = await client().post("/transferrecipient", {
      type: "mobile_money",
      name,
      account_number: phoneNumber,
      bank_code: "MPESA",
      currency: "KES",
    });
    return { recipientCode: res.data.data.recipient_code };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("[paystackTransferService.createRecipient] Paystack rejected the recipient:", {
        status: err.response?.status,
        body: err.response?.data,
      });
      throw new ApiError(
        502,
        "PAYSTACK_RECIPIENT_FAILED",
        err.response?.data?.message || "Could not register this hotel's payout details with Paystack."
      );
    }
    throw err;
  }
}

export interface InitiateTransferResult {
  transferCode: string;
  status: string; // Paystack's own status string (pending/success/otp/failed/…) — mapped by the caller, same convention as paymentProvider's VerifyPaymentResult
}

/** reference is OUR transfer_reference (hotel_payouts.transfer_reference) — Paystack's own idempotency key for this transfer, same pattern as a payment's reference. */
export async function initiateTransfer(params: {
  recipientCode: string;
  amount: number; // whole KSh — converted to subunits here, same boundary-only conversion as paystackProvider
  reference: string;
  reason: string;
}): Promise<InitiateTransferResult> {
  try {
    const res = await client().post("/transfer", {
      source: "balance",
      amount: Math.round(params.amount * 100),
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
      currency: "KES",
    });
    const data = res.data.data;
    return { transferCode: data.transfer_code, status: data.status };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("[paystackTransferService.initiateTransfer] Paystack rejected the transfer:", {
        status: err.response?.status,
        body: err.response?.data,
      });
      throw new ApiError(
        502,
        "PAYSTACK_TRANSFER_FAILED",
        err.response?.data?.message || "Could not initiate this payout with Paystack."
      );
    }
    throw err;
  }
}

export interface VerifyTransferResult {
  status: "success" | "failed" | "pending";
  transferCode: string;
  failureReason: string | null;
}

function mapTransferStatus(status: string): VerifyTransferResult["status"] {
  if (status === "success") return "success";
  if (status === "failed" || status === "reversed") return "failed";
  return "pending"; // pending, otp, processing, queued — never trust a webhook/initiate response alone, same principle as payment verification
}

/** Authoritative status check — same "never trust the initiate response alone" principle as paystackProvider.verifyPayment. */
export async function verifyTransfer(transferCodeOrId: string): Promise<VerifyTransferResult> {
  try {
    const res = await client().get(`/transfer/${encodeURIComponent(transferCodeOrId)}`);
    const data = res.data.data;
    return {
      status: mapTransferStatus(data.status),
      transferCode: data.transfer_code,
      failureReason: data.status !== "success" ? data.status : null,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      throw new ApiError(404, "TRANSFER_NOT_FOUND", "No matching Paystack transfer found.");
    }
    throw new ApiError(502, "PAYSTACK_TRANSFER_VERIFY_FAILED", "Could not verify this payout with Paystack.");
  }
}

export function isPayoutConfigured(): boolean {
  return Boolean(env.paystackSecretKey);
}
