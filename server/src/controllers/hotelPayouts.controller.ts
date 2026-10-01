import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import * as model from "../models/hotelPayoutModel";
import * as payoutService from "../services/hotelPayoutService";

/**
 * Admin-only — mounted under adminRouter (admin.routes.ts), which
 * already requires requireRole("mealvest_admin") at the router level.
 * Every handler here is the "HOTEL PAYOUT COMPLETED" side of the
 * system, deliberately separate from student payment endpoints
 * (payments.controller.ts) — see migration 038's own comment.
 */

export async function listPendingPayouts(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotels = await model.listHotelsWithPendingBalance();
    res.json({ hotels });
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
