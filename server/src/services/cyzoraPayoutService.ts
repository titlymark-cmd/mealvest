import { ApiError } from "../middleware/errorHandler";
import { classifyProviderSendError, PayoutSendError } from "./payoutOutcome";
import { normalizeKenyanPhone } from "../lib/phone";
import { isCyzoraConfigured, cyzoraGet, cyzoraPost, kesToCents, centsToKes, mapCyzoraError } from "./cyzoraClient";

/**
 * Cyzora payouts — sends money FROM the MEALVEST Cyzora balance to a
 * hotel's registered settlement destination via POST /payouts. The
 * Cyzora counterpart of paystackTransferService.ts, called only from
 * hotelPayoutService.triggerPayout (admin-only, server-side): a secret
 * key can send money anywhere, so nothing here is reachable from a
 * student/hotel route or the browser.
 *
 * Status goes requested -> processing -> paid | failed. The final
 * state reaches us through the signed payout.paid / payout.failed
 * webhooks (payments.controller.cyzoraWebhook -> hotelPayoutService.
 * applyCyzoraPayoutWebhook). Live payouts need a verified Cyzora
 * business; with an sk_test_ key nothing moves real money.
 */

/** Cyzora's floor: 3000 cents = KES 30. */
export const CYZORA_PAYOUT_MIN_CENTS = 3000;

export type CyzoraDestinationType = "mobile" | "till" | "paybill" | "bank";

export interface CyzoraDestination {
  destination_type: CyzoraDestinationType;
  phone?: string; // mobile
  short_code?: string; // till, paybill
  account_ref?: string; // paybill
  bank_code?: string; // bank (from GET /payout-banks)
  account_number?: string; // bank
  account_name?: string; // bank
}

/**
 * MEALVEST settlement methods (settlementMethodSchema.ts) -> Cyzora
 * destination types. `bank` is deliberately NOT mapped yet: the hotel
 * form stores a free-text bankName, while Cyzora needs a bank_code
 * from GET /payout-banks — guessing a match could send money to the
 * wrong bank, so bank-settled hotels report NOT_SUPPORTED and need a
 * manual payout until that mapping is confirmed against the docs.
 */
const SUPPORTED_METHODS = ["mpesa_till", "paybill", "send_money", "pochi_la_biashara"] as const;
type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

export function isCyzoraPayoutSupported(method: string): method is SupportedMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method);
}

interface HotelPaymentDetails {
  method: string;
  tillNumber?: string; // mpesa_till
  paybillNumber?: string; // paybill
  accountNumber?: string; // paybill (and bank)
  phoneNumber?: string; // send_money
  pochiPhoneNumber?: string; // pochi_la_biashara
}

function requireField(value: string | undefined, label: string): string {
  const v = (value ?? "").trim();
  if (!v) {
    throw new ApiError(400, "PAYOUT_DETAILS_INCOMPLETE", `This hotel's settlement details are missing its ${label}.`);
  }
  return v;
}

function requirePhone(value: string | undefined, label: string): string {
  const normalized = normalizeKenyanPhone(requireField(value, label));
  if (!normalized) {
    throw new ApiError(400, "PAYOUT_DETAILS_INVALID", `This hotel's ${label} is not a valid Kenyan M-Pesa number.`);
  }
  return normalized;
}

/** Builds the exact destination fields Cyzora's POST /payouts expects for a hotel's stored settlement details. */
export function buildCyzoraDestination(details: HotelPaymentDetails): CyzoraDestination {
  switch (details.method) {
    case "mpesa_till":
      return { destination_type: "till", short_code: requireField(details.tillNumber, "till number") };
    case "paybill":
      return {
        destination_type: "paybill",
        short_code: requireField(details.paybillNumber, "paybill number"),
        account_ref: requireField(details.accountNumber, "paybill account number"),
      };
    case "send_money":
      return { destination_type: "mobile", phone: requirePhone(details.phoneNumber, "M-Pesa phone number") };
    case "pochi_la_biashara":
      // Pochi la Biashara is an M-Pesa wallet addressed by phone number.
      return { destination_type: "mobile", phone: requirePhone(details.pochiPhoneNumber, "Pochi la Biashara number") };
    default:
      throw new ApiError(
        400,
        "PAYOUT_METHOD_NOT_SUPPORTED",
        `Automated Cyzora payout isn't available yet for the "${details.method}" settlement method — pay it out manually for now.`
      );
  }
}

export interface CyzoraPayoutResult {
  payoutId: string; // Cyzora's payout id — stored in hotel_payouts.transfer_code, matched by payout.* webhooks
  status: string; // Cyzora's own string (requested/processing/paid/failed) — mapped by the caller
  feeKes: number | null; // Cyzora's processing fee, when the response reports one; recorded separately from MEALVEST commission
  raw: unknown;
}

function unwrap(body: any): any {
  if (body && typeof body === "object" && body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body ?? {};
}

/**
 * POST /payouts. `reference` is OUR hotel_payouts.transfer_reference
 * (PO-…) and goes out as the Idempotency-Key, so a retried "Pay out"
 * click or a network retry can never create a second real payout.
 * Status in the response is NOT final — a payout can still be
 * "requested"/"processing" here even when it will succeed; the real
 * outcome arrives via the payout.paid/payout.failed webhook.
 */
export async function createPayout(params: {
  amount: number; // whole KSh — converted to cents here, same boundary-only conversion as cyzoraProvider
  reference: string;
  destination: CyzoraDestination;
  description?: string;
}): Promise<CyzoraPayoutResult> {
  const amountCents = kesToCents(params.amount);
  if (amountCents < CYZORA_PAYOUT_MIN_CENTS) {
    throw new ApiError(
      400,
      "PAYOUT_BELOW_MINIMUM",
      `Cyzora payouts must be at least KSh ${CYZORA_PAYOUT_MIN_CENTS / 100}; this hotel is owed KSh ${params.amount}.`
    );
  }
  const body: Record<string, unknown> = { amount: amountCents, ...params.destination };
  if (params.description) body.description = params.description;

  try {
    const raw = await cyzoraPost("/payouts", body, params.reference);
    const payout = unwrap(raw);
    if (!payout?.id) {
      console.error("[cyzoraPayoutService.createPayout] Payout response had no id:", raw);
      throw new PayoutSendError(false, "CYZORA_PAYOUT_FAILED", "Cyzora did not return a payout id.");
    }
    const fee = centsToKes(payout.fee ?? payout.fee_amount);
    return {
      payoutId: String(payout.id),
      status: String(payout.status ?? "requested"),
      feeKes: Number.isFinite(fee) ? fee : null,
      raw,
    };
  } catch (err) {
    // Logged via mapCyzoraError for the same diagnostics as before, but
    // the THROWN error is classified: only a clear refusal is a failure.
    if (!(err instanceof PayoutSendError)) mapCyzoraError(err, "createPayout", "Could not initiate this payout with Cyzora.");
    throw classifyProviderSendError(err, "CYZORA_PAYOUT_FAILED", "Could not initiate this payout with Cyzora.");
  }
}

/** GET /payouts/fee-preview?amount= — what Cyzora will charge for a payout of this size, in whole KSh. */
export async function previewPayoutFee(amountKes: number): Promise<{ feeKes: number | null; raw: unknown }> {
  try {
    const raw = await cyzoraGet("/payouts/fee-preview", { amount: kesToCents(amountKes) });
    const data = unwrap(raw);
    const fee = centsToKes(data?.fee ?? data?.fee_amount);
    return { feeKes: Number.isFinite(fee) ? fee : null, raw };
  } catch (err) {
    throw mapCyzoraError(err, "previewPayoutFee", "Could not preview the payout fee with Cyzora.");
  }
}

/** GET /payout-banks — the bank_code list a future `bank` destination mapping needs. Exposed for an admin lookup, not used by payouts yet (see buildCyzoraDestination). */
export async function listPayoutBanks(): Promise<unknown> {
  try {
    return await cyzoraGet("/payout-banks");
  } catch (err) {
    throw mapCyzoraError(err, "listPayoutBanks", "Could not load Cyzora's bank list.");
  }
}

/** Cyzora payout statuses -> hotel_payouts.status. */
export function mapCyzoraPayoutStatus(status: unknown): "processing" | "successful" | "failed" {
  const s = String(status ?? "").toLowerCase();
  if (s === "paid" || s === "succeeded" || s === "success") return "successful";
  if (s === "failed" || s === "reversed" || s === "cancelled" || s === "canceled") return "failed";
  return "processing"; // requested, processing, pending …
}

export function isCyzoraPayoutConfigured(): boolean {
  return isCyzoraConfigured();
}
