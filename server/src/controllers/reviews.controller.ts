import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Hotel reviews (migration 042): one rating + optional comment per
 * student per hotel.
 *
 *   GET    /api/hotels/:hotelId/reviews      public — summary + latest reviews
 *   GET    /api/hotels/:hotelId/reviews/me   student — eligibility + own review
 *   POST   /api/hotels/:hotelId/reviews      student — create or update own review
 *   DELETE /api/hotels/:hotelId/reviews/me   student — remove own review
 *
 * Eligibility is server-side only: a student may review a hotel after
 * at least one REDEEMED order there (they paid for and collected a
 * meal). The frontend asks /me to decide whether to show the form, but
 * POST re-checks regardless of what the UI did.
 */

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Pick a rating from 1 to 5.").max(5, "Pick a rating from 1 to 5."),
  comment: z.string().trim().max(500, "Keep your review under 500 characters.").optional().nullable(),
});

const REVIEWS_PAGE = 20;

async function hotelExists(hotelId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM hotels WHERE id = $1 AND status = 'active'", [hotelId]);
  return result.rows.length > 0;
}

async function hasRedeemedOrder(userId: string, hotelId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM orders WHERE user_id = $1 AND hotel_id = $2 AND status = 'redeemed' LIMIT 1",
    [userId, hotelId]
  );
  return result.rows.length > 0;
}

/** Student display name for a public review: first name + last initial, never email or phone. */
function publicName(fullName: string | null): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MEALVEST student";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export async function listHotelReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    if (!(await hotelExists(hotelId))) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");

    const [summary, reviews] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average,
                COUNT(*) FILTER (WHERE rating = 5)::int AS five,
                COUNT(*) FILTER (WHERE rating = 4)::int AS four,
                COUNT(*) FILTER (WHERE rating = 3)::int AS three,
                COUNT(*) FILTER (WHERE rating = 2)::int AS two,
                COUNT(*) FILTER (WHERE rating = 1)::int AS one
         FROM hotel_reviews WHERE hotel_id = $1`,
        [hotelId]
      ),
      pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at, s.full_name
         FROM hotel_reviews r
         LEFT JOIN students s ON s.user_id = r.user_id
         WHERE r.hotel_id = $1
         ORDER BY r.updated_at DESC
         LIMIT $2`,
        [hotelId, REVIEWS_PAGE]
      ),
    ]);

    const s = summary.rows[0];
    res.json({
      summary: {
        count: s.count,
        average: Number(s.average),
        distribution: { 5: s.five, 4: s.four, 3: s.three, 2: s.two, 1: s.one },
      },
      reviews: reviews.rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        updated_at: r.updated_at,
        reviewer: publicName(r.full_name),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyHotelReview(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    if (!(await hotelExists(hotelId))) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    const [eligible, existing] = await Promise.all([
      hasRedeemedOrder(req.user!.id, hotelId),
      pool.query("SELECT id, rating, comment, created_at, updated_at FROM hotel_reviews WHERE hotel_id = $1 AND user_id = $2", [
        hotelId,
        req.user!.id,
      ]),
    ]);
    res.json({
      eligible,
      reason: eligible ? null : "NO_REDEEMED_ORDER",
      review: existing.rows[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function upsertHotelReview(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid review.");
    if (!(await hotelExists(hotelId))) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    if (!(await hasRedeemedOrder(req.user!.id, hotelId))) {
      throw new ApiError(403, "REVIEW_NOT_ELIGIBLE", "You can review a hotel after you've collected a meal there.");
    }

    const comment = parsed.data.comment ? parsed.data.comment : null;
    const result = await pool.query(
      `INSERT INTO hotel_reviews (hotel_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (hotel_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING id, rating, comment, created_at, updated_at, (xmax = 0) AS inserted`,
      [hotelId, req.user!.id, parsed.data.rating, comment]
    );
    const row = result.rows[0];
    res.status(row.inserted ? 201 : 200).json({
      review: { id: row.id, rating: row.rating, comment: row.comment, created_at: row.created_at, updated_at: row.updated_at },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteMyHotelReview(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query("DELETE FROM hotel_reviews WHERE hotel_id = $1 AND user_id = $2 RETURNING id", [
      req.params.hotelId,
      req.user!.id,
    ]);
    if (result.rows.length === 0) throw new ApiError(404, "REVIEW_NOT_FOUND", "You haven't reviewed this hotel.");
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}
