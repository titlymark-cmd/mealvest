import crypto from "crypto";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { cyzoraGet, cyzoraPost, kesToCents, centsToKes, mapCyzoraError } from "./cyzoraClient";
import {
  PaymentProvider,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
} from "./paymentProvider";

/**
 * Cyzora payments adapter — sits next to PaystackPaymentProvider and
 * implements the same PaymentProvider interface, plus the hosted-
 * checkout flow Paystack's adapter never exposed.
 *
 * Two ways to collect, per Cyzora's API:
 *   - STK push: POST /charges { amount, phone, account_ref } sends the
 *     M-Pesa prompt straight to the student's phone; our own payment
 *     screen polls until it's done. Status pending -> succeeded |
 *     failed | timeout, read back with GET /charges/{id}.
 *   - Hosted checkout: POST /transactions/initialize returns a
 *     `reference` and a `checkout_url` to redirect the student to;
 *     verified with GET /transactions/verify/{reference}.
 *
 * The one rule this file exists to enforce: nothing here ever marks a
 * payment paid. Both initialize calls return a pending record; the
 * ONLY inputs that ever flip a transaction to 'success' are a
 * signature-verified `charge.succeeded` webhook or a verify call that
 * returns `succeeded` — and even the webhook path re-verifies against
 * Cyzora's API before paymentService.activatePaymentIfNeeded runs its
 * amount check and idempotency guard. The redirect's `?status=success`
 * and any client-side callback are never trusted.
 */

export const CYZORA_CHECKOUT_DESCRIPTION_MAX = 200;
export const CYZORA_CHECKOUT_EXPIRES_MIN = 300;
export const CYZORA_CHECKOUT_EXPIRES_MAX = 86400;
export const CYZORA_CHECKOUT_EXPIRES_DEFAULT = 1800;
export const CYZORA_METADATA_MAX_PAIRS = 20;

export type CyzoraChannel = "stk_push" | "hosted_checkout";

/** Cyzora charge statuses -> this codebase's shared VerifyPaymentResult status. */
export function mapCyzoraChargeStatus(status: unknown): VerifyPaymentResult["status"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "succeeded" || s === "success" || s === "paid") return "success";
  // `timeout` is the STK prompt going unanswered, `expired` a checkout
  // session past expires_in — neither can still complete, so both are
  // terminal failures from the ledger's point of view. A hosted
  // checkout session that Cyzora reports as failed-but-retryable keeps
  // its own transaction row re-checkable anyway: activatePaymentIfNeeded
  // only treats 'success' as terminal, never 'failed'.
  if (s === "failed" || s === "timeout" || s === "expired" || s === "cancelled" || s === "canceled") return "failed";
  return "pending"; // pending, processing, requested, "" …
}

/**
 * Cyzora responses are JSON objects; some APIs wrap the resource in a
 * `data` envelope. Accept either shape so a wrapper change on their
 * side doesn't silently turn every status into "pending".
 */
function unwrap(body: any): any {
  if (body && typeof body === "object" && body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return body.data;
  }
  return body ?? {};
}

function toVerifyResult(reference: string, resource: any, raw: unknown): VerifyPaymentResult {
  const charge = resource?.charge && typeof resource.charge === "object" ? resource.charge : resource;
  // When Cyzora echoes our account_ref, it must be OUR reference — a
  // record for another payment must never credit this one.
  const accountRef = charge?.account_ref ?? resource?.account_ref;
  if (typeof accountRef === "string" && accountRef && accountRef !== reference) {
    throw new ApiError(502, "CYZORA_REFERENCE_MISMATCH", "Cyzora returned a record for a different reference.");
  }
  const amountKes = centsToKes(charge?.amount);
  return {
    reference,
    status: mapCyzoraChargeStatus(charge?.status),
    amount: Number.isFinite(amountKes) ? amountKes : NaN,
    currency: String(charge?.currency || "KES"),
    providerTransactionId: String(charge?.id ?? charge?.reference ?? resource?.reference ?? ""),
    paidAt: charge?.paid_at || charge?.completed_at || charge?.updated_at || null,
    raw,
  };
}

export interface CyzoraCheckoutParams {
  amount: number; // whole KSh — converted to cents at the boundary
  reference: string; // ours — becomes account_ref + the Idempotency-Key
  description?: string;
  callbackUrl?: string;
  cancelUrl?: string;
  customerPhone?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  expiresIn?: number;
}

export interface CyzoraCheckoutResult extends InitializePaymentResult {
  checkoutUrl: string;
  expiresIn: number;
}

/** Cyzora only allows https callback/cancel URLs (plain http for localhost only) — reject early with a clear message instead of a confusing 400 from the API. */
export function assertCyzoraRedirectUrl(url: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(400, "INVALID_REDIRECT_URL", `${field} must be an absolute URL.`);
  }
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new ApiError(400, "INVALID_REDIRECT_URL", `${field} must use https (http is only allowed for localhost).`);
  }
}

export class CyzoraPaymentProvider implements PaymentProvider {
  /**
   * STK push — POST /charges. Returns a PENDING record: Cyzora's charge
   * id goes into providerTransactionId so the controller can store it
   * on the transaction row (provider_transaction_id) and verifyCharge()
   * can read the charge back later. The STK prompt landing on the
   * phone is not payment; only a later verify/webhook is.
   */
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const body: Record<string, unknown> = {
      amount: kesToCents(params.amount),
      // 254XXXXXXXXX, exactly as normalizeKenyanPhone stores it — Cyzora
      // accepts this form directly (no "+" prefix, unlike Paystack).
      phone: params.phoneNumber,
      account_ref: params.reference,
    };
    try {
      const raw = await cyzoraPost("/charges", body, params.reference);
      const charge = unwrap(raw);
      const chargeId = charge?.id;
      if (!chargeId) {
        console.error("[cyzoraProvider.initializePayment] Charge response had no id:", raw);
        throw new ApiError(502, "CYZORA_INIT_FAILED", "Cyzora did not return a charge id. Please try again.");
      }
      return {
        reference: params.reference,
        providerReference: String(chargeId),
        displayText: "Enter your M-Pesa PIN on your phone to complete payment.",
        raw,
      };
    } catch (err) {
      throw mapCyzoraError(err, "initializePayment", "Could not start the M-Pesa payment with Cyzora. Please try again.");
    }
  }

  /**
   * Hosted checkout — POST /transactions/initialize. The student is
   * redirected to checkout_url; Cyzora later redirects them back to
   * callback_url (with query params we deliberately ignore for status)
   * or cancel_url. providerTransactionId is Cyzora's session
   * `reference`, the handle GET /transactions/verify/{reference} needs.
   */
  async initializeCheckout(params: CyzoraCheckoutParams): Promise<CyzoraCheckoutResult> {
    const body: Record<string, unknown> = {
      amount: kesToCents(params.amount),
      account_ref: params.reference,
    };
    if (params.description) {
      if (params.description.length > CYZORA_CHECKOUT_DESCRIPTION_MAX) {
        throw new ApiError(400, "VALIDATION_ERROR", `description must be at most ${CYZORA_CHECKOUT_DESCRIPTION_MAX} characters.`);
      }
      body.description = params.description;
    }
    if (params.callbackUrl) {
      assertCyzoraRedirectUrl(params.callbackUrl, "callback_url");
      body.callback_url = params.callbackUrl;
    }
    if (params.cancelUrl) {
      assertCyzoraRedirectUrl(params.cancelUrl, "cancel_url");
      body.cancel_url = params.cancelUrl;
    }
    if (params.customerPhone) body.customer_phone = params.customerPhone;
    if (params.customerEmail) body.customer_email = params.customerEmail;
    if (params.metadata) {
      const entries = Object.entries(params.metadata).filter(([, v]) => typeof v === "string");
      if (entries.length > CYZORA_METADATA_MAX_PAIRS) {
        throw new ApiError(400, "VALIDATION_ERROR", `metadata may hold at most ${CYZORA_METADATA_MAX_PAIRS} text pairs.`);
      }
      if (entries.length > 0) body.metadata = Object.fromEntries(entries);
    }
    const expiresIn = params.expiresIn ?? CYZORA_CHECKOUT_EXPIRES_DEFAULT;
    if (!Number.isInteger(expiresIn) || expiresIn < CYZORA_CHECKOUT_EXPIRES_MIN || expiresIn > CYZORA_CHECKOUT_EXPIRES_MAX) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `expires_in must be between ${CYZORA_CHECKOUT_EXPIRES_MIN} and ${CYZORA_CHECKOUT_EXPIRES_MAX} seconds.`
      );
    }
    body.expires_in = expiresIn;

    try {
      const raw = await cyzoraPost("/transactions/initialize", body, params.reference);
      const session = unwrap(raw);
      const checkoutUrl = session?.checkout_url;
      const cyzoraReference = session?.reference;
      if (!checkoutUrl || !cyzoraReference) {
        console.error("[cyzoraProvider.initializeCheckout] Response lacked reference/checkout_url:", raw);
        throw new ApiError(502, "CYZORA_INIT_FAILED", "Cyzora did not return a checkout URL. Please try again.");
      }
      return {
        reference: params.reference,
        providerReference: String(cyzoraReference),
        checkoutUrl: String(checkoutUrl),
        expiresIn,
        raw,
      };
    } catch (err) {
      throw mapCyzoraError(err, "initializeCheckout", "Could not create the Cyzora checkout session. Please try again.");
    }
  }

  /** GET /charges/{id} — authoritative read of an STK-push charge. `reference` is OUR reference, carried through for the ledger. */
  async verifyCharge(chargeId: string, reference: string): Promise<VerifyPaymentResult> {
    try {
      const raw = await cyzoraGet(`/charges/${encodeURIComponent(chargeId)}`);
      const result = toVerifyResult(reference, unwrap(raw), raw);
      if (result.status !== "success") {
        console.warn("[cyzoraProvider.verifyCharge] Non-success from Cyzora:", {
          reference,
          chargeId,
          cyzoraStatus: unwrap(raw)?.status,
          failureReason: unwrap(raw)?.failure_reason ?? unwrap(raw)?.error,
        });
      }
      return result;
    } catch (err) {
      throw mapCyzoraError(err, "verifyCharge", "Could not verify this payment with Cyzora.");
    }
  }

  /** GET /transactions/verify/{reference} — authoritative read of a hosted-checkout session. `cyzoraReference` is Cyzora's; `reference` is ours. */
  async verifyCheckout(cyzoraReference: string, reference: string): Promise<VerifyPaymentResult> {
    try {
      const raw = await cyzoraGet(`/transactions/verify/${encodeURIComponent(cyzoraReference)}`);
      const result = toVerifyResult(reference, unwrap(raw), raw);
      if (result.status !== "success") {
        console.warn("[cyzoraProvider.verifyCheckout] Non-success from Cyzora:", {
          reference,
          cyzoraReference,
          cyzoraStatus: unwrap(raw)?.status,
        });
      }
      return result;
    } catch (err) {
      throw mapCyzoraError(err, "verifyCheckout", "Could not verify this payment with Cyzora.");
    }
  }

  /** Dispatches to the right verify endpoint for how the row was created — see migration 040's provider_channel. */
  async verifyByChannel(channel: CyzoraChannel | null, providerTransactionId: string, reference: string): Promise<VerifyPaymentResult> {
    if (!providerTransactionId) {
      throw new ApiError(409, "PAYMENT_NOT_INITIALIZED", "This payment has no Cyzora identifier to verify against.");
    }
    return channel === "hosted_checkout"
      ? this.verifyCheckout(providerTransactionId, reference)
      : this.verifyCharge(providerTransactionId, reference);
  }

  /**
   * PaymentProvider.verifyPayment takes OUR reference — but Cyzora
   * reads are keyed by ITS charge id / session reference, which live
   * on the transactions row. The controller resolves that row and
   * calls verifyByChannel() directly; this interface method exists
   * only so CyzoraPaymentProvider satisfies PaymentProvider and is a
   * deliberate loud failure if anything calls it the Paystack way.
   */
  async verifyPayment(_reference: string): Promise<VerifyPaymentResult> {
    throw new ApiError(
      500,
      "CYZORA_VERIFY_NEEDS_ID",
      "Cyzora payments are verified by charge id / session reference — use verifyByChannel()."
    );
  }

  /**
   * Verifies `X-Cyzora-Signature` — hex HMAC-SHA256 of the RAW request
   * body using the webhook secret (whsec_…) — on the exact bytes
   * received, BEFORE any JSON parsing, with a constant-time compare.
   * Throws a 401 ApiError on any mismatch so the route can answer 401
   * (Cyzora's documented expectation for a bad signature). Returns the
   * parsed event; callers read the event name from `event`.
   */
  parseWebhookEvent(rawBody: Buffer, signatureHeader: string | string[] | undefined): any {
    return verifyCyzoraWebhookSignature(rawBody, signatureHeader);
  }

  /**
   * PaymentProvider.handleWebhook — signature check, then an
   * independent re-verification against Cyzora's own API, never a
   * trust of the event body's status. Needs the transaction row to
   * know which Cyzora identifier/endpoint to use, so the webhook
   * controller does the DB lookup and calls verifyByChannel(); this
   * interface method is the same loud guard as verifyPayment above.
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<VerifyPaymentResult> {
    verifyCyzoraWebhookSignature(rawBody, signatureHeader);
    throw new ApiError(
      500,
      "CYZORA_WEBHOOK_NEEDS_LOOKUP",
      "Cyzora webhooks are processed by payments.controller.cyzoraWebhook, which resolves the transaction row first."
    );
  }

  async getPaymentStatus(reference: string): Promise<VerifyPaymentResult["status"]> {
    const result = await this.verifyPayment(reference);
    return result.status;
  }
}

/** Shared by payment (charge.*) and payout (payout.*) webhook consumers — the check only needs implementing once. */
export function verifyCyzoraWebhookSignature(rawBody: Buffer, signatureHeader: string | string[] | undefined): any {
  if (!env.cyzoraWebhookSecret) {
    throw new ApiError(500, "CYZORA_NOT_CONFIGURED", "CYZORA_WEBHOOK_SECRET is not set on this server.");
  }
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header || typeof header !== "string") {
    throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Missing X-Cyzora-Signature header.");
  }
  if (!Buffer.isBuffer(rawBody)) {
    // express.raw() guarantees a Buffer; anything else means the JSON
    // parser ran first and the bytes are no longer what Cyzora signed.
    throw new ApiError(500, "WEBHOOK_BODY_NOT_RAW", "Webhook body was not received as raw bytes.");
  }

  const expected = crypto.createHmac("sha256", env.cyzoraWebhookSecret).update(rawBody).digest("hex");
  // Accept the hex digest case-insensitively (hex is hex), but still
  // compare the full value in constant time.
  const provided = header.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new ApiError(401, "INVALID_WEBHOOK_SIGNATURE", "Cyzora webhook signature verification failed.");
  }

  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_WEBHOOK_PAYLOAD", "Cyzora webhook body was not valid JSON.");
  }
}

/**
 * The resource a Cyzora event is about. Events carry the event name in
 * `event`; the charge/payout object itself is read from `data` when
 * present (the common envelope shape), else from `charge`/`payout`,
 * else the event body itself — tolerant on purpose, since the exact
 * envelope couldn't be confirmed against the docs from this
 * environment (see the integration notes in TESTING.md). Only
 * identifiers come out of here; status is always re-verified by API.
 */
export function extractWebhookResource(event: any): any {
  if (!event || typeof event !== "object") return {};
  if (event.data && typeof event.data === "object") {
    const d = event.data;
    if (d.object && typeof d.object === "object") return d.object;
    return d;
  }
  if (event.charge && typeof event.charge === "object") return event.charge;
  if (event.payout && typeof event.payout === "object") return event.payout;
  return event;
}

export const cyzoraProvider = new CyzoraPaymentProvider();
