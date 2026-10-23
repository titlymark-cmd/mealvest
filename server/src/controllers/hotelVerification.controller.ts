import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

/**
 * GET /api/admin/hotels/:hotelId/payment-verification
 *
 * What the admin needs in order to check a hotel's payout details:
 * the settlement method, the details the hotel supplied, and the
 * current verification state.
 */
export async function getPaymentVerification(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const result = await pool.query(
      `SELECT id, name, payment_method, payment_details,
              payment_verification_status, payment_verified_at
       FROM hotels WHERE id = $1`,
      [hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    res.json({ verification: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/hotels/:hotelId/payment-verification/verify
 *
 * Marks the hotel's payout details as verified by the signed-in admin.
 * Only touches the verification columns; payout behaviour is unchanged.
 * The admin audit middleware records the call automatically.
 */
export async function verifyPaymentDetails(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const result = await pool.query(
      `UPDATE hotels
          SET payment_verification_status = 'verified',
              payment_verification_reason = NULL,
              payment_verified_at = now(),
              payment_verified_by = $2,
              updated_at = now()
        WHERE id = $1
        RETURNING id, name, payment_method, payment_details,
                  payment_verification_status, payment_verified_at`,
      [hotelId, req.user?.id ?? null]
    );
    if (result.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    res.json({ verification: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
