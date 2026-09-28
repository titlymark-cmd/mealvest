import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import * as budgetService from "../services/budgetService";
import { createBudgetSchema } from "../schemas/budgetSchemas";
import { updateStudentProfileSchema } from "../schemas/studentSchemas";
import { ApiError } from "../middleware/errorHandler";

export async function getStudentProfile(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.phone_number, u.alternate_phone_number, u.account_status,
              s.full_name, s.institution, s.admission_number
       FROM users u JOIN students s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, "PROFILE_NOT_FOUND", "Student profile not found.");
    }
    res.json({ profile: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Partial update — only the fields present in the body are touched.
 * full_name/institution/admission_number live on `students`,
 * phone_number/alternate_phone_number on `users`; both are updated in
 * one transaction so a client never sees a half-applied edit.
 * Email is deliberately not editable here — it's a sign-in identifier,
 * changing it needs its own re-verification flow, out of scope.
 */
export async function updateStudentProfile(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateStudentProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid profile update.");
    }
    const { fullName, phoneNumber, alternatePhoneNumber, institution, admissionNumber } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (fullName !== undefined || institution !== undefined || admissionNumber !== undefined) {
        await client.query(
          `UPDATE students SET
             full_name = COALESCE($1, full_name),
             institution = COALESCE($2, institution),
             admission_number = COALESCE($3, admission_number)
           WHERE user_id = $4`,
          [fullName ?? null, institution ?? null, admissionNumber ?? null, req.user!.id]
        );
      }

      if (phoneNumber !== undefined || alternatePhoneNumber !== undefined) {
        await client.query(
          `UPDATE users SET
             phone_number = COALESCE($1, phone_number),
             alternate_phone_number = CASE WHEN $2::text IS NULL THEN alternate_phone_number
                                            WHEN $2 = '' THEN NULL
                                            ELSE $2 END
           WHERE id = $3`,
          [phoneNumber ?? null, alternatePhoneNumber ?? null, req.user!.id]
        );
      }

      const result = await client.query(
        `SELECT u.id, u.email, u.phone_number, u.alternate_phone_number, u.account_status,
                s.full_name, s.institution, s.admission_number
         FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.id = $1`,
        [req.user!.id]
      );

      await client.query("COMMIT");
      res.json({ profile: result.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function createBudget(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const budget = await budgetService.createBudget({
      userId: req.user!.id,
      totalAmount: parsed.data.totalAmount,
      numberOfDays: parsed.data.numberOfDays,
      hotelId: parsed.data.hotelId,
      planId: parsed.data.planId,
      termsAccepted: parsed.data.termsAccepted,
    });
    res.status(201).json({ budget });
  } catch (err) {
    next(err);
  }
}

export async function getBudget(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const budget = await budgetService.getActiveBudget(req.user!.id);
    if (!budget) {
      res.status(404).json({ error: { code: "NO_ACTIVE_BUDGET", message: "No active meal plan found." } });
      return;
    }
    res.json({ budget });
  } catch (err) {
    next(err);
  }
}

/**
 * Locked/unlocked status the student dashboard uses to render the
 * 🔒/✅ withdrawal icon. The lock itself is enforced again,
 * independently, inside withdrawSavings() at actual withdrawal time —
 * this is a read-only convenience for the UI, not a second source of
 * truth.
 */
export async function getWithdrawalStatus(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT b.id, b.remaining_amount, b.end_date, (b.end_date <= CURRENT_DATE) AS contract_ended,
              EXISTS(SELECT 1 FROM savings_withdrawals w WHERE w.budget_id = b.id) AS already_withdrawn
       FROM budgets b WHERE b.user_id = $1 AND b.status = 'active' LIMIT 1`,
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.json({ locked: true, reason: "NO_ACTIVE_BUDGET" });
      return;
    }
    const row = result.rows[0];
    res.json({
      locked: !row.contract_ended || row.already_withdrawn,
      contractEndDate: row.end_date,
      availableSavings: row.remaining_amount,
      reason: row.already_withdrawn ? "ALREADY_WITHDRAWN" : row.contract_ended ? null : "CONTRACT_ACTIVE",
    });
  } catch (err) {
    next(err);
  }
}

const withdrawSchema = z.object({
  payoutMethod: z.enum(["mpesa", "bank"]),
  payoutDestination: z.string().trim().min(3).max(40),
});

export async function requestWithdrawal(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    const result = await budgetService.withdrawSavings({
      userId: req.user!.id,
      payoutMethod: parsed.data.payoutMethod,
      payoutDestination: parsed.data.payoutDestination,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function transferToNextDay(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const budget = await budgetService.transferRemainingToNextDay(req.user!.id);
    res.json({ budget });
  } catch (err) {
    next(err);
  }
}

export async function confirmRollover(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const budget = await budgetService.confirmRollover(req.user!.id);
    res.json({ budget });
  } catch (err) {
    next(err);
  }
}

export async function declineRollover(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const budget = await budgetService.declineRollover(req.user!.id);
    res.json({ budget });
  } catch (err) {
    next(err);
  }
}

/**
 * Hotel Transfer (switching a student's active plan to a different
 * hotel mid-contract for a KSh 50 fee) is intentionally frozen for
 * MVP1 — the frontend never calls this in normal use (the "Switch
 * hotel" UI just shows a locked/MVP2 message locally, no request
 * made). This exists only as a defense-in-depth backend safety net so
 * a direct call to the endpoint can't do anything real: no table, no
 * payment, no budget/hotel mutation — just a clear rejection.
 */
export async function requestHotelTransfer(_req: AuthedRequest, _res: Response, next: NextFunction) {
  next(new ApiError(501, "FEATURE_NOT_AVAILABLE", "Hotel Transfer is coming in MVP 2."));
}
