import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { normalizeKenyanPhone } from "../lib/phone";
import { paystackProvider } from "../services/paystackProvider";
import {
  generatePaymentReference,
  createPendingTransaction,
  createPendingBoostTransaction,
  activatePaymentIfNeeded,
} from "../services/paymentService";
import { getActiveBudget } from "../services/budgetService";
import { pool } from "../config/db";

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
      checkoutUrl: result.checkoutUrl,
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
export async function initializeBoostPayment(req: AuthedRequest, res: Response, next: NextFunction) {
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
      checkoutUrl: result.checkoutUrl,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyPaystackPayment(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { reference } = req.params;
    if (!reference) throw new ApiError(400, "VALIDATION_ERROR", "reference is required.");

    // Ownership check before even calling Paystack — a student can
    // only verify/poll their OWN payment reference.
    const owned = await pool.query("SELECT user_id FROM transactions WHERE provider_reference = $1", [reference]);
    if (owned.rows.length === 0) throw new ApiError(404, "PAYMENT_NOT_FOUND", "No matching payment found.");
    if (owned.rows[0].user_id !== req.user!.id) throw new ApiError(403, "FORBIDDEN", "This is not your payment.");

    const verified = await paystackProvider.verifyPayment(reference);
    const result = await activatePaymentIfNeeded(reference, verified);

    res.json({ reference, status: verified.status, alreadyProcessed: result.alreadyProcessed });
  } catch (err) {
    next(err);
  }
}

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
export async function paystackWebhook(req: AuthedRequest, res: Response) {
  try {
    const signature = req.headers["x-paystack-signature"] as string | undefined;
    const verified = await paystackProvider.handleWebhook(req.body as Buffer, signature);
    await activatePaymentIfNeeded(verified.reference, verified);
  } catch (err) {
    // Log server-side only — Paystack just needs a fast 200 either
    // way, or it will retry the webhook repeatedly. Our own
    // idempotency guard means a retry is always safe regardless.
    console.error("Paystack webhook processing error:", (err as Error).message);
  }
  res.status(200).send("ok");
}
