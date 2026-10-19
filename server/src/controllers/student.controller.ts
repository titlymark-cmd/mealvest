import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import * as budgetService from "../services/budgetService";
import { updateStudentProfileSchema } from "../schemas/studentSchemas";
import { ApiError } from "../middleware/errorHandler";
import { uploadStudentAvatar } from "../services/storageService";
import { normalizeKenyanPhone } from "../lib/phone";
import { pinSchema } from "../schemas/authSchemas";
import { verifyStepUp } from "../services/authService";
import { verifyGoogleIdToken } from "../lib/googleAuth";
import { businessDate } from "../lib/businessTime";

export async function getStudentProfile(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.phone_number, u.alternate_phone_number, u.account_status,
              (u.pin_hash IS NOT NULL) AS has_pin, (u.google_id IS NOT NULL) AS has_google, u.email_verified, u.phone_verified,
              s.full_name, s.institution, s.admission_number, s.avatar_url
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
    const { fullName, institution, admissionNumber } = parsed.data;
    // Phone numbers are login identifiers and M-Pesa numbers: store only
    // the canonical 254XXXXXXXXX form (M3), so one number can't exist in
    // two spellings on two accounts.
    let phoneNumber: string | undefined;
    if (parsed.data.phoneNumber !== undefined) {
      const n = normalizeKenyanPhone(parsed.data.phoneNumber);
      if (!n) throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");
      phoneNumber = n;
    }
    let alternatePhoneNumber: string | undefined;
    if (parsed.data.alternatePhoneNumber !== undefined) {
      if (parsed.data.alternatePhoneNumber === "") alternatePhoneNumber = "";
      else {
        const n = normalizeKenyanPhone(parsed.data.alternatePhoneNumber);
        if (!n) throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan alternate phone number.");
        alternatePhoneNumber = n;
      }
    }

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
             -- changing the number invalidates its verification (M3)
             phone_verified = CASE WHEN $1::text IS NOT NULL AND $1 IS DISTINCT FROM phone_number THEN false ELSE phone_verified END,
             phone_verified_at = CASE WHEN $1::text IS NOT NULL AND $1 IS DISTINCT FROM phone_number THEN NULL ELSE phone_verified_at END,
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
              (u.pin_hash IS NOT NULL) AS has_pin, (u.google_id IS NOT NULL) AS has_google, u.email_verified, u.phone_verified,
                s.full_name, s.institution, s.admission_number, s.avatar_url
         FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.id = $1`,
        [req.user!.id]
      );

      await client.query("COMMIT");
      res.json({ profile: result.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if ((err as { code?: string }).code === "23505") {
        throw new ApiError(409, "PHONE_IN_USE", "That phone number is already linked to another account.");
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Multer-handled multipart upload (see student.routes.ts) — userId for
 * the storage path comes from req.user!.id, never from client input,
 * so a student can only ever overwrite their own avatar object.
 */
export async function uploadAvatar(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "VALIDATION_ERROR", "No image file was provided.");
    }

    const url = await uploadStudentAvatar(req.user!.id, file);
    await pool.query("UPDATE students SET avatar_url = $1 WHERE user_id = $2", [url, req.user!.id]);

    res.status(201).json({ avatarUrl: url });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/student/budget — RETIRED (security finding C1).
 *
 * This endpoint used to create an active, spendable budget from a
 * client-supplied amount with no payment at all. A budget can now only
 * be created by payment activation (paymentService.activatePaymentIfNeeded)
 * after the provider confirms the money, and the database rejects any
 * other insert (migration 043). The route answers 410 so an old client
 * (the legacy Expo app in app/) gets a clear message instead of a 404.
 */
export async function createBudget(_req: AuthedRequest, _res: Response, next: NextFunction) {
  next(
    new ApiError(
      410,
      "FUNDING_REQUIRED",
      "Meal plans are started by paying for them. Please choose a plan and complete payment."
    )
  );
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
    const feePercent = await budgetService.getWithdrawalFeePercent();
    const [active, latest] = await Promise.all([
      pool.query(
        `SELECT b.id, b.remaining_amount, b.end_date, (b.end_date <= $2::date) AS contract_ended,
                EXISTS(SELECT 1 FROM savings_withdrawals w WHERE w.budget_id = b.id AND w.status <> 'rejected') AS already_withdrawn
         FROM budgets b WHERE b.user_id = $1 AND b.status = 'active' LIMIT 1`,
        [req.user!.id, businessDate()]
      ),
      pool.query(
        `SELECT id, gross_savings, student_amount, platform_fee_percent, platform_fee_amount, payout_method,
                payout_destination, status, created_at, processed_at, payout_reference
         FROM savings_withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id]
      ),
    ]);
    const latestWithdrawal = latest.rows[0] ?? null;

    if (active.rows.length === 0) {
      res.json({ locked: true, reason: "NO_ACTIVE_BUDGET", feePercent, latestWithdrawal });
      return;
    }
    const row = active.rows[0];
    const gross = Number(row.remaining_amount);
    const split = budgetService.computeWithdrawalSplit(gross, feePercent);
    res.json({
      locked: !row.contract_ended || row.already_withdrawn,
      contractEndDate: row.end_date,
      availableSavings: row.remaining_amount,
      feePercent,
      feeAmount: split.feeAmount,
      netAmount: split.studentAmount,
      reason: row.already_withdrawn ? "ALREADY_WITHDRAWN" : row.contract_ended ? null : "CONTRACT_ACTIVE",
      latestWithdrawal,
    });
  } catch (err) {
    next(err);
  }
}

const withdrawSchema = z.object({
  payoutMethod: z.enum(["mpesa", "bank"]),
  payoutDestination: z.string().trim().min(3).max(40),
  // Same backend-authoritative acknowledgement pattern as plan creation:
  // the student must have been shown the fee breakdown and agreed.
  acceptFee: z.literal(true, { errorMap: () => ({ message: "Please confirm you understand the withdrawal fee." }) }),
  // Step-up proof (M1): PIN for accounts that have one, otherwise a fresh Google re-authentication.
  pin: pinSchema.optional(),
  googleIdToken: z.string().min(1).max(4096).optional(),
});

export async function requestWithdrawal(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    let destination = parsed.data.payoutDestination;
    if (parsed.data.payoutMethod === "mpesa") {
      const normalized = normalizeKenyanPhone(destination);
      if (!normalized) throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan M-Pesa number.");
      destination = normalized;
    }
    // Optional policy (M3): require a verified phone before withdrawing.
    // Off by default so existing (unverified) accounts aren't locked out;
    // enable once SMS verification is configured and users have been notified.
    if (process.env.REQUIRE_VERIFIED_PHONE_FOR_WITHDRAWAL === "true") {
      const v = await pool.query("SELECT phone_verified FROM users WHERE id = $1", [req.user!.id]);
      if (!v.rows[0]?.phone_verified) {
        throw new ApiError(403, "PHONE_NOT_VERIFIED", "Verify your phone number in your profile before withdrawing.");
      }
    }

    // Server-side step-up before any money is reserved (same atomic PIN lockout as login).
    await verifyStepUp(req.user!.id, { pin: parsed.data.pin, googleIdToken: parsed.data.googleIdToken }, verifyGoogleIdToken);

    const result = await budgetService.withdrawSavings({
      userId: req.user!.id,
      payoutMethod: parsed.data.payoutMethod,
      payoutDestination: destination,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /api/student/withdrawals — the student's own withdrawal history, newest first. */
export async function listMyWithdrawals(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT w.id, w.gross_savings, w.student_amount, w.platform_fee_percent, w.platform_fee_amount,
              w.hotel_incentive_amount, w.payout_method, w.payout_destination, w.status, w.created_at,
              w.processed_at, w.payout_reference, h.name AS hotel_name
       FROM savings_withdrawals w
       LEFT JOIN hotels h ON h.id = w.hotel_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC LIMIT 50`,
      [req.user!.id]
    );
    res.json({ withdrawals: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/student/payments — the student's own payment ledger: every
 * plan payment / boost attempt (transactions table) with its provider
 * reference and outcome. Read-only, their own rows only; the status
 * shown is what the ledger holds (set only by verify/webhook), never
 * anything derived client-side.
 */
export async function listMyPayments(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT t.id, t.type, t.amount, t.status, t.provider, t.provider_reference, t.provider_channel,
              t.number_of_days, t.result_description, t.created_at, t.updated_at, h.name AS hotel_name
       FROM transactions t
       LEFT JOIN hotels h ON h.id = t.hotel_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC LIMIT 100`,
      [req.user!.id]
    );
    res.json({ payments: result.rows });
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
