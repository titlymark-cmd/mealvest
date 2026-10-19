import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/hotelPayoutModel";
import * as payoutService from "../services/hotelPayoutService";
import * as cyzoraPayouts from "../services/cyzoraPayoutService";

/**
 * Admin-only — mounted under adminRouter (admin.routes.ts), which
 * already requires requireRole("mealvest_admin") at the router level.
 * Every handler here is the "HOTEL PAYOUT COMPLETED" side of the
 * system, deliberately separate from student payment endpoints
 * (payments.controller.ts) — see migration 038's own comment.
 */

export async function listPendingPayouts(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const provider = payoutService.activePayoutProvider();
    // `payout_supported` is decided server-side per the ACTIVE provider
    // (Paystack and Cyzora can automate different settlement methods)
    // so the admin screen never has to hardcode either provider's list.
    const hotels = (await model.listHotelsWithPendingBalance()).map((h) => ({
      ...h,
      payout_supported: Boolean(h.payment_method && payoutService.isPayoutSupported(h.payment_method)),
    }));
    res.json({ hotels, provider, configured: payoutService.isPayoutConfigured() });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/payouts/fee-preview?amount=<KSh> — Cyzora's processing fee for a payout of this size (recorded separately from MEALVEST commission, never netted into it). */
export async function previewPayoutFee(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (payoutService.activePayoutProvider() !== "cyzora") {
      throw new ApiError(400, "FEE_PREVIEW_UNAVAILABLE", "Fee preview is only available when Cyzora is the active payout provider.");
    }
    const amount = Number(req.query.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "VALIDATION_ERROR", "amount (whole KSh) is required.");
    const preview = await cyzoraPayouts.previewPayoutFee(amount);
    res.json({ amount, feeKes: preview.feeKes, raw: preview.raw });
  } catch (err) {
    next(err);
  }
}

export async function listPayoutHistory(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const payouts = await model.listAllPayouts();
    res.json({ payouts });
  } catch (err) {
    next(err);
  }
}

const triggerPayoutSchema = z.object({ hotelId: z.string().uuid() });

export async function triggerPayout(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = triggerPayoutSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "hotelId is required.");

    const payout = await payoutService.triggerPayout(parsed.data.hotelId, req.user!.id);
    res.status(201).json({ payout });
  } catch (err) {
    next(err);
  }
}

export async function refreshPayoutStatus(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const payout = await payoutService.verifyPayout(req.params.payoutId);
    res.json({ payout });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/payouts/:payoutId/approve — review -> approved -> sent (same reference). */
export async function approvePayout(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const payout = await payoutService.approveAndSubmitPayout(req.params.payoutId, req.user!.id);
    res.json({ payout });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/payouts/:payoutId/cancel — only for a payout that was never sent; releases its orders. */
export async function cancelPayout(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const payout = await payoutService.cancelPayout(req.params.payoutId, req.user!.id);
    res.json({ payout });
  } catch (err) {
    next(err);
  }
}
