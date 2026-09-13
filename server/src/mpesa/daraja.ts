import axios from "axios";
import { ApiError } from "../middleware/errorHandler";

/**
 * Ported from an earlier Firebase-Functions-based prototype of this
 * backend, adapted to plain env vars for Express instead of Firebase
 * Secret Manager. Logic is unchanged — this is the real Daraja OAuth
 * + STK Push flow, not a mock.
 *
 * Required env vars (see .env.example):
 *   MPESA_CONSUMER_KEY
 *   MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE
 *   MPESA_PASSKEY
 *   MPESA_CALLBACK_URL
 *   MPESA_ENVIRONMENT   ("sandbox" | "production")
 */
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || "174379";
const MPESA_ENVIRONMENT = process.env.MPESA_ENVIRONMENT || "sandbox";
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "";
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "";

const BASE_URL =
  MPESA_ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function darajaTimestamp(): string {
  const now = new Date();
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3, no DST
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    nairobi.getUTCFullYear().toString() +
    pad(nairobi.getUTCMonth() + 1) +
    pad(nairobi.getUTCDate()) +
    pad(nairobi.getUTCHours()) +
    pad(nairobi.getUTCMinutes()) +
    pad(nairobi.getUTCSeconds())
  );
}

function darajaPassword(timestamp: string): string {
  return Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");
}

async function getAccessToken(): Promise<string> {
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new ApiError(
      500,
      "MPESA_NOT_CONFIGURED",
      "M-Pesa is not configured on this server yet. Set MPESA_CONSUMER_KEY/SECRET in .env."
    );
  }
  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
  try {
    const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    return res.data.access_token as string;
  } catch (err) {
    console.error("Daraja OAuth token request failed:", (err as Error).message);
    throw new ApiError(500, "MPESA_UNREACHABLE", "Could not reach M-Pesa. Please try again shortly.");
  }
}

export interface StkPushParams {
  amount: number;
  phoneNumber: string; // already normalized to 254XXXXXXXXX
  accountReference: string; // e.g. order id, max 12 chars
  transactionDesc: string; // max 13 chars
}

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

/**
 * A successful response here means Safaricom queued the prompt on
 * the customer's phone — it is NOT proof of payment. Proof only
 * comes from the callback (see paymentsController.mpesaCallback).
 */
export async function initiateStkPush(params: StkPushParams): Promise<StkPushResult> {
  if (!MPESA_CALLBACK_URL) {
    throw new ApiError(
      500,
      "MPESA_NOT_CONFIGURED",
      "MPESA_CALLBACK_URL is not set. This must be a public HTTPS URL Safaricom can reach — localhost will not work."
    );
  }

  const token = await getAccessToken();
  const timestamp = darajaTimestamp();
  const password = darajaPassword(timestamp);

  try {
    const res = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(params.amount),
        PartyA: params.phoneNumber,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: params.phoneNumber,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: params.accountReference.slice(0, 12),
        TransactionDesc: params.transactionDesc.slice(0, 13),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.data.ResponseCode !== "0") {
      throw new ApiError(402, "PAYMENT_FAILED", res.data.ResponseDescription || "M-Pesa rejected the payment request.");
    }
    return res.data as StkPushResult;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("Daraja STK push failed:", (err as Error).message);
    throw new ApiError(402, "PAYMENT_FAILED", "Could not initiate M-Pesa payment. Please try again.");
  }
}
