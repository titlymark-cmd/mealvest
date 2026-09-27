import { Response, NextFunction, Request } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

const CUSTOMER_CARE_KEY = "customer_care_phone";

export async function getCustomerCarePhone(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query("SELECT value FROM platform_settings WHERE key = $1", [CUSTOMER_CARE_KEY]);
    res.json({ phone: result.rows[0]?.value ?? null });
  } catch (err) {
    next(err);
  }
}

const updateCustomerCareSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^0\d{9}$/, "Enter a 10-digit Kenyan number starting with 0, e.g. 0798180082."),
});

export async function updateCustomerCarePhone(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateCustomerCareSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid phone number.");
    }
    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING value`,
      [CUSTOMER_CARE_KEY, parsed.data.phone, req.user!.id]
    );
    res.json({ phone: result.rows[0].value });
  } catch (err) {
    next(err);
  }
}
