import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { normalizeKenyanPhone } from "../lib/phone";
import { paystackProvider, verifyPaystackWebhookSignature } from "../services/paystackProvider";
import {
  cyzoraProvider,
  verifyCyzoraWebhookSignature,
  extractWebhookResource,
} from "../services/cyzoraProvider";
import { isCyzoraConfigured, isCyzoraTestMode } from "../services/cyzoraClient";
import {
  generatePaymentReference,
  createPendingTransaction,
  createPendingBoostTransaction,
  activatePaymentIfNeeded,
  recordProviderTransactionId,
  findTransactionByReference,
  findTransactionByProviderTransactionId,
  PendingTransactionLookup,
} from "../services/paymentService";
import { verifyTransactionRow } from "../services/paymentVerification";
import { getActiveBudget } from "../services/budgetService";
import { getPayoutByReference } from "../models/hotelPayoutModel";
import { verifyPayout, applyCyzoraPayoutWebhook } from "../services/hotelPayoutService";
import { pool } from "../config/db";

/**
 * Which provider NEW payments go through (PAYMENT_PROVIDER_DEFAULT:
 * "paystack" unless set to "cyzora"). Verification of an existing
 * payment never consults this — it follows the provider stored on the
 * transaction row, so flipping the default mid-flight is safe.
 */
export function activePaymentProvider(): "paystack" | "cyzora" {
  return env.paymentProviderDefault === "cyzora" ? "cyzora" : "paystack";
}

const MIN_AMOUNT = 500;
const MAX_AMOUNT = 50000;

// Meal Boost is a small top-up to an already-active plan, not a new
// plan purchase — same currency, deliberately lower floor than a
// fresh plan (the whole point is letting a student add "some small
// deposit", per spec) and a lower ceiling too, since it's topping up
// an existing budget rather than funding a new multi-week one.
const MIN_BOOST_AMOUNT = 100;
const MAX_BOOST_AMOUNT = 20000;

// No `plans` table exists in this codebase (see migration history) —
// a student chooses their own amount + day count rather than picking
// a fixed-price plan. "Never trust the frontend price" here means:
// never trust the frontend's claim that a payment SUCCEEDED (that
// always comes from verify()/webhook against Paystack's own API) —
// the amount itself is legitimately student-chosen input, validated
// against a sane range rather than looked up from a catalog.
export const initializeSchema = z.object({
  amount: z.number().min(MIN_AMOUNT, `Minimum plan amount is KSh ${MIN_AMOUNT}.`).max(MAX_AMOUNT, `Maximum plan amount is KSh ${MAX_AMOUNT}.`),
  numberOfDays: z.number().int().min(1).max(90),
  phone: z.string().min(9),
  email: z.string().email(),
  hotelId: z.string().uuid().optional().nullable(),
  // Enforced HERE, not just on createBudget — this is the actual
  // point where a real payment is about to be initiated, matching
  // "disclaimer must be shown BEFORE final payment confirmation, not
  // after." A request without this is rejected before Paystack is
  // ever contacted, so no money moves without it. (This also closes
  // a real bug: budgetService.createBudget independently requires
  // termsAccepted too, and until this fix, the payment-activation
  // path never passed it — every successful Paystack payment would
  // have failed to activate the budget it just paid for.)
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Mealvest payment terms to continue." }),
  }),
});

export async function initializePaystackPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = initializeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { amount, numberOfDays, email, hotelId } = parsed.data;
    const phoneNumber = normalizeKenyanPhone(parsed.data.phone);
    if (!phoneNumber) {
      throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
    }

    const reference = generatePaymentReference();

    await createPendingTransaction({
      userId: req.user!.id,
      hotelId: hotelId ?? null,
      amount,
      phoneNumber,
      provider: "paystack",
      reference,
      numberOfDays,
    });

    const result = await paystackProvider.initializePayment({
      userId: req.user!.id,
      amount,
      phoneNumber,
      email,
      reference,
    });

    res.status(201).json({
      reference: result.reference,
      displayText: result.displayText,
    });
  } catch (err) {
    next(err);
  }
}

export const initializeBoostSchema = z.object({
  amount: z
    .number()
    .min(MIN_BOOST_AMOUNT, `Minimum boost amount is KSh ${MIN_BOOST_AMOUNT}.`)
    .max(MAX_BOOST_AMOUNT, `Maximum boost amount is KSh ${MAX_BOOST_AMOUNT}.`),
  phone: z.string().min(9),
  email: z.string().email(),
});

/**
 * Meal Boost — top up the student's EXISTING active plan (raises
 * remaining_amount, which raises daily_allowance on the next read)
 * rather than starting a new one. Reuses the same Paystack
 * initialize/verify/webhook path as a fresh plan purchase — the only
 * difference is which transaction type gets recorded and what
 * activatePaymentIfNeeded does once Paystack confirms payment (see
 * paymentService.ts).
 */
export async function initializePaystackBoostPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = initializeBoostSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { amount, email } = parsed.data;
    const phoneNumber = normalizeKenyanPhone(parsed.data.phone);
    if (!phoneNumber) {
      throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
    }

    // A boost only makes sense against a plan that already exists —
    // checked here, before Paystack is ever contacted, same as every
    // other guard in this file.
    const budget = await getActiveBudget(req.user!.id);
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan to boost.");
    }

    const reference = generatePaymentReference();

    await createPendingBoostTransaction({
      userId: req.user!.id,
      budgetId: budget.id,
      amount,
      phoneNumber,
      provider: "paystack",
      reference,
    });

    const result = await paystackProvider.initializePayment({
      userId: req.user!.id,
      amount,
      phoneNumber,
      email,
      reference,
    });

    res.status(201).json({
      reference: result.reference,
      displayText: result.displayText,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    if (!reference) throw new ApiError(400, "VALIDATION_ERROR", "reference is required.");

    // Ownership check before even calling the provider — a student can
    // only verify/poll their OWN payment reference.
    const row = await findTransactionByReference(reference);
    if (!row) throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching payment found.");
    if (row.user_id !== req.user!.id) throw new ApiError(403, "FORBIDDEN", "This is not your payment.");

    const verified = await verifyTransactionRow(row);
    const result = await activatePaymentIfNeeded(reference, verified);

    res.json({
      reference,
      status: verified.status,
      alreadyProcessed: result.alreadyProcessed,
      provider: row.provider,
      ...(result.needsReview ? { needsReview: true } : {}),
    });
  } catch (err) {
    next(err);
  }
}

/** Kept under its historical name/route — provider dispatch is by row, so this is the same handler. */
export const verifyPaystackPayment = verifyPayment;

export async function getPaymentStatus(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    const result = await pool.query(
      "SELECT status, amount, provider FROM transactions WHERE provider_reference = $1 AND user_id = $2",
      [reference, req.user!.id]
    );
    if (result.rows.length === 0) throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching payment found.");
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Raw body required for signature verification — see app.ts, this
 * route is mounted with express.raw() ahead of the normal JSON body
 * parser, specifically so the exact bytes Paystack signed are what
 * we verify against (re-serializing parsed JSON can subtly change
 * byte content and break the HMAC check).
 */
/**
 * One endpoint handles both payment (charge.*) and payout (transfer.*)
 * events — Paystack posts every event type to the single webhook URL
 * configured on the account. The signature check happens once, up
 * front; everything after that branches by event.event, each branch
 * still independently re-verifying against Paystack's own API rather
 * than trusting the webhook body (verifyPayment / hotelPayoutService.
 * verifyPayout — never activatePaymentIfNeeded or finalizePayoutStatus
 * driven by event.data.status alone).
 */
export async function paystackWebhook(req: AuthedRequest, res: Response) {
  const signature = req.headers["x-paystack-signature"] as string | undefined;
  let event: any;
  try {
    event = verifyPaystackWebhookSignature(req.body as Buffer, signature);
  } catch (err) {
    // Bad/missing signature: never processed, never retried into success.
    const status = err instanceof ApiError ? err.status : 401;
    console.warn("Paystack webhook rejected:", (err as Error).message);
    res.status(status).json({ error: "invalid signature" });
    return;
  }

  try {
    const eventType = event?.event as string | undefined;
    if (eventType?.startsWith("transfer.")) {
      const reference = event?.data?.reference;
      const payout = reference ? await getPayoutByReference(reference) : null;
      if (payout) await verifyPayout(payout.id);
    } else if (eventType?.startsWith("charge.")) {
      // The body is never trusted for the outcome: handleWebhook
      // re-verifies against Paystack's API by reference.
      const verified = await paystackProvider.handleWebhook(req.body as Buffer, signature);
      await activatePaymentIfNeeded(verified.reference, verified);
    }
    res.status(200).send("ok");
  } catch (err) {
    // Response contract (finding H1): Paystack retries any non-2xx.
    //   4xx ApiError = permanent outcome (unknown reference, amount
    //   mismatch already recorded for review, ...) -> 200, no retry.
    //   anything else (DB error, Paystack API down, ...) -> 500 so the
    //   event is redelivered; the transaction stays unactivated and the
    //   reconciliation cron is the second safety net.
    if (err instanceof ApiError && err.status < 500) {
      console.error("Paystack webhook: final processing outcome:", err.code, err.message);
      res.status(200).json({ received: true, outcome: err.code });
      return;
    }
    console.error("Paystack webhook processing error (will be retried):", (err as Error).message);
    res.status(500).json({ error: "processing failed, please retry" });
  }
}


// =====================================================================
// Cyzora
// =====================================================================

/**
 * Public origin for hosted-checkout redirect URLs. APP_BASE_URL wins
 * when set; otherwise the browser's Origin header IF it's one of our
 * own ALLOWED_ORIGINS (local dev: CRA on :3000 calling the API on
 * :4000 — the student must land back on the frontend, not the API);
 * otherwise this request's own protocol/host (same-origin production
 * deploys behind Vercel, where trust proxy makes req.protocol right).
 */
function appBaseUrlFor(req: Request): string {
  if (env.appBaseUrl) return env.appBaseUrl;
  const origin = req.get("origin");
  if (origin && env.allowedOrigins.includes(origin)) return origin.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function requireCyzora(): void {
  if (!isCyzoraConfigured()) {
    throw new ApiError(503, "CYZORA_NOT_CONFIGURED", "Cyzora payments are not configured on this server yet.");
  }
}

/** POST /api/payments/cyzora/initialize — M-Pesa STK push via Cyzora (same request body as the Paystack route). */
export async function initializeCyzoraPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    requireCyzora();
    const parsed = initializeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { amount, numberOfDays, email, hotelId } = parsed.data;
    const phoneNumber = normalizeKenyanPhone(parsed.data.phone);
    if (!phoneNumber) {
      throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
    }

    const reference = generatePaymentReference();

    await createPendingTransaction({
      userId: req.user!.id,
      hotelId: hotelId ?? null,
      amount,
      phoneNumber,
      provider: "cyzora",
      reference,
      numberOfDays,
      channel: "stk_push",
    });

    const result = await cyzoraProvider.initializePayment({
      userId: req.user!.id,
      amount,
      phoneNumber,
      email,
      reference,
    });
    // Cyzora's charge id — what GET /charges/{id} and the webhook
    // lookup key on. Written now, while the row is still 'pending'.
    await recordProviderTransactionId(reference, result.providerReference);

    res.status(201).json({ reference, displayText: result.displayText, provider: "cyzora" });
  } catch (err) {
    next(err);
  }
}

/** POST /api/payments/cyzora/boost/initialize — Meal Boost top-up via a Cyzora STK push. */
export async function initializeCyzoraBoostPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    requireCyzora();
    const parsed = initializeBoostSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { amount, email } = parsed.data;
    const phoneNumber = normalizeKenyanPhone(parsed.data.phone);
    if (!phoneNumber) {
      throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
    }

    const budget = await getActiveBudget(req.user!.id);
    if (!budget) {
      throw new ApiError(404, "BUDGET_NOT_FOUND", "You don't have an active meal plan to boost.");
    }

    const reference = generatePaymentReference();

    await createPendingBoostTransaction({
      userId: req.user!.id,
      budgetId: budget.id,
      amount,
      phoneNumber,
      provider: "cyzora",
      reference,
      channel: "stk_push",
    });

    const result = await cyzoraProvider.initializePayment({
      userId: req.user!.id,
      amount,
      phoneNumber,
      email,
      reference,
    });
    await recordProviderTransactionId(reference, result.providerReference);

    res.status(201).json({ reference, displayText: result.displayText, provider: "cyzora" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/cyzora/checkout/initialize — Cyzora HOSTED
 * checkout for a new plan. Same validated body as the STK route; the
 * response carries a `checkoutUrl` for the browser to navigate to.
 * callback_url points at the app's existing /payment/callback screen
 * with OUR reference, which just polls GET /api/payments/verify — the
 * `?status=success` Cyzora appends to the redirect is never read.
 */
export async function initializeCyzoraCheckout(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    requireCyzora();
    const parsed = initializeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { amount, numberOfDays, email, hotelId } = parsed.data;
    const phoneNumber = normalizeKenyanPhone(parsed.data.phone);
    if (!phoneNumber) {
      throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
    }

    const reference = generatePaymentReference();
    const baseUrl = appBaseUrlFor(req);

    await createPendingTransaction({
      userId: req.user!.id,
      hotelId: hotelId ?? null,
      amount,
      phoneNumber,
      provider: "cyzora",
      reference,
      numberOfDays,
      channel: "hosted_checkout",
    });

    const result = await cyzoraProvider.initializeCheckout({
      amount,
      reference,
      description: `MEALVEST meal plan — ${numberOfDays} day${numberOfDays === 1 ? "" : "s"}`,
      callbackUrl: `${baseUrl}/payment/callback?reference=${encodeURIComponent(reference)}`,
      cancelUrl: `${baseUrl}/student/budget-onboarding`,
      customerPhone: phoneNumber,
      customerEmail: email,
      metadata: { reference, userId: req.user!.id, type: "budget_topup" },
    });
    // Cyzora's session reference — what GET /transactions/verify/{reference} keys on.
    await recordProviderTransactionId(reference, result.providerReference);

    res.status(201).json({ reference, checkoutUrl: result.checkoutUrl, expiresIn: result.expiresIn, provider: "cyzora" });
  } catch (err) {
    next(err);
  }
}

/** GET /api/payments/config — lets the payment screen know which provider is active and whether hosted checkout exists for it. */
export async function getPaymentConfig(_req: AuthedRequest, res: Response) {
  const provider = activePaymentProvider();
  res.json({
    provider,
    hostedCheckoutAvailable: provider === "cyzora" && isCyzoraConfigured(),
    testMode: provider === "cyzora" ? isCyzoraTestMode() : env.paystackSecretKey.startsWith("sk_test_"),
  });
}

// ---- Generic (provider-agnostic) entry points the frontend uses ----

export async function initializePayment(req: AuthedRequest, res: Response, next: NextFunction) {
  return activePaymentProvider() === "cyzora"
    ? initializeCyzoraPayment(req, res, next)
    : initializePaystackPayment(req, res, next);
}

export async function initializeBoostPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  return activePaymentProvider() === "cyzora"
    ? initializeCyzoraBoostPayment(req, res, next)
    : initializePaystackBoostPayment(req, res, next);
}

function webhookResponse(res: Response, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

/**
 * POST /api/webhooks/cyzora — one endpoint for every Cyzora event
 * (charge.succeeded / charge.failed / charge.expired / payout.paid /
 * payout.failed / webhook.test). Mounted with express.raw() ahead of
 * the JSON parser (see app.ts + webhooks.routes.ts) so the signature
 * is checked on the exact bytes Cyzora signed.
 *
 * Response codes are chosen around Cyzora's retry schedule (10s, 30s,
 * 2m, 10m after a non-2xx):
 *   401  bad/missing signature — never retried into success, by design
 *   404  we can't match the event to a row YET (the webhook raced our
 *        own initialize bookkeeping) — a retry lands after the row is
 *        written
 *   500  our own processing failed (DB/Cyzora API hiccup) — retry
 *   200  handled, or deliberately ignored (wrong mode, unknown event,
 *        duplicate) — the idempotency guard in activatePaymentIfNeeded
 *        makes any redelivery a safe no-op anyway
 * Nothing in the event BODY is trusted for a charge's outcome: every
 * charge.* event triggers an independent GET against Cyzora's API and
 * only THAT result (plus the amount check) can mark a payment paid.
 */
export async function cyzoraWebhook(req: Request, res: Response) {
  let event: any;
  try {
    let rawBody: unknown = req.body;
    if (typeof rawBody === "string") rawBody = Buffer.from(rawBody, "utf8");
    event = verifyCyzoraWebhookSignature(rawBody as Buffer, req.headers["x-cyzora-signature"]);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 401;
    console.warn("Cyzora webhook rejected:", (err as Error).message);
    return webhookResponse(res, status, { error: (err as Error).message });
  }

  const eventName = String(event?.event ?? "");
  const resource = extractWebhookResource(event);

  if (eventName === "webhook.test") {
    console.info("Cyzora webhook.test received", { livemode: event?.livemode });
    return webhookResponse(res, 200, { received: true });
  }

  // Mode guard: a test event (livemode:false) must never touch a
  // live-keyed server's ledger, and vice versa.
  if (typeof event?.livemode === "boolean" && event.livemode === isCyzoraTestMode()) {
    console.warn("Cyzora webhook ignored — livemode does not match this server's key mode:", {
      event: eventName,
      livemode: event.livemode,
    });
    return webhookResponse(res, 200, { received: true, ignored: "mode_mismatch" });
  }

  try {
    if (eventName.startsWith("payout.")) {
      const payoutId = resource?.id;
      if (!payoutId) return webhookResponse(res, 400, { error: "payout event had no id" });
      const applied = await applyCyzoraPayoutWebhook(eventName, String(payoutId));
      if (!applied) return webhookResponse(res, 404, { error: "no matching payout yet" });
      return webhookResponse(res, 200, { received: true });
    }

    if (eventName.startsWith("charge.")) {
      // charge.failed with retryable:true means a hosted-checkout
      // session is still payable — one failed attempt is not the
      // order's final outcome, so don't flip our row (and notify the
      // student of a failure) over it. The eventual charge.succeeded
      // or charge.expired decides.
      const retryable = event?.retryable === true || resource?.retryable === true;
      if (eventName === "charge.failed" && retryable) {
        return webhookResponse(res, 200, { received: true, ignored: "retryable_failure" });
      }

      // Our own MV- reference travels as account_ref on both flows and
      // exists on the row from before Cyzora was ever called, so it's
      // the primary key here; Cyzora's id/reference is the fallback.
      let row: PendingTransactionLookup | null = null;
      if (typeof resource?.account_ref === "string" && resource.account_ref) {
        row = await findTransactionByReference(resource.account_ref);
      }
      for (const candidate of [resource?.id, resource?.reference]) {
        if (row) break;
        if (candidate) row = await findTransactionByProviderTransactionId("cyzora", String(candidate));
      }
      if (!row) return webhookResponse(res, 404, { error: "no matching transaction" });
      if (row.provider !== "cyzora") return webhookResponse(res, 200, { received: true, ignored: "not_a_cyzora_row" });
      if (!row.provider_transaction_id) {
        // Row exists but our initialize call hasn't recorded Cyzora's
        // id yet — the webhook beat us. Let Cyzora retry in 10s.
        return webhookResponse(res, 404, { error: "transaction not yet initialized" });
      }

      const verified = await verifyTransactionRow(row);
      await activatePaymentIfNeeded(row.provider_reference, verified);
      return webhookResponse(res, 200, { received: true });
    }

    console.info("Cyzora webhook ignored — unhandled event:", eventName);
    return webhookResponse(res, 200, { received: true, ignored: "unhandled_event" });
  } catch (err) {
    // AMOUNT_MISMATCH (already recorded as failed + flagged) and other
    // 4xx outcomes are final — a retry can't change them. Anything
    // else is ours to fix, so ask Cyzora to redeliver.
    if (err instanceof ApiError && err.status < 500) {
      console.error("Cyzora webhook: final processing outcome:", err.code, err.message);
      return webhookResponse(res, 200, { received: true, outcome: err.code });
    }
    console.error("Cyzora webhook processing error:", (err as Error).message);
    return webhookResponse(res, 500, { error: "processing failed, please retry" });
  }
}
