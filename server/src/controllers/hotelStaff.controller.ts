import { NextFunction, Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { emailSchema, phoneSchema } from "../schemas/authSchemas";
import * as staffService from "../services/hotelStaffService";

/**
 * Owner-only staff management. The route layer applies requireRole("hotel_owner");
 * the service re-checks the owner row and resolves the hotel from it, so nothing
 * here ever accepts a hotel id from the client.
 */

const createStaffSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the staff member's full name.").max(120),
    email: emailSchema,
    phoneNumber: phoneSchema,
  })
  .strict();

const staffIdSchema = z.string().uuid();

function staffId(req: AuthedRequest): string {
  const parsed = staffIdSchema.safeParse(req.params.staffUserId);
  // A malformed id gets the same answer as an unknown one.
  if (!parsed.success) throw new ApiError(404, "STAFF_NOT_FOUND", "Staff member not found.");
  return parsed.data;
}

export async function listStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json(await staffService.listStaff(req.user!.id));
  } catch (err) {
    next(err);
  }
}

export async function getStaffMember(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json({ staff: await staffService.getStaffMember(req.user!.id, staffId(req)) });
  } catch (err) {
    next(err);
  }
}

export async function createStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const { fullName, email, phoneNumber } = parsed.data;
    const result = await staffService.createStaff(req.user!.id, { fullName, email, phoneNumber });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resendStaffInvite(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json(await staffService.resendInvite(req.user!.id, staffId(req)));
  } catch (err) {
    next(err);
  }
}

export async function deactivateStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json({ staff: await staffService.deactivateStaff(req.user!.id, staffId(req)) });
  } catch (err) {
    next(err);
  }
}

export async function reactivateStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json({ staff: await staffService.reactivateStaff(req.user!.id, staffId(req)) });
  } catch (err) {
    next(err);
  }
}
