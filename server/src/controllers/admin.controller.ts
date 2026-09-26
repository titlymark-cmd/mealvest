import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { hashPassword } from "../lib/password";
import { normalizeKenyanPhone } from "../lib/phone";

const TERMS_VERSION = "2026-01-mealvest-hotel-partnership-v1";

export async function getAdminOverview(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const [students, hotels, orders, withdrawals] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'student'"),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'active') AS active,
                COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
                COUNT(*) FILTER (WHERE status = 'pending_verification') AS pending
         FROM hotels`
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today,
                COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed,
                COUNT(*) FILTER (WHERE status = 'paid') AS pending,
                COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed'), 0) AS gross_transaction_value,
                COALESCE(SUM(commission_amount) FILTER (WHERE status = 'redeemed'), 0) AS mealvest_commission
         FROM orders`
      ),
      pool.query("SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending_withdrawals FROM savings_withdrawals"),
    ]);

    res.json({
      students: Number(students.rows[0].count),
      hotels: hotels.rows[0],
      orders: orders.rows[0],
      withdrawals: withdrawals.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// -----------------------------------------------------------------
// Hotel registration — the ONLY way a hotel_owner account and its
// hotel record come into existence. No public self-registration
// route creates a hotel; this is deliberately admin-only.
// -----------------------------------------------------------------
const paymentDetailsSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("bank"), bankName: z.string().min(1), accountName: z.string().min(1), accountNumber: z.string().min(1) }),
  z.object({ method: z.literal("mpesa_till"), tillNumber: z.string().min(1), businessName: z.string().min(1) }),
  z.object({ method: z.literal("mpesa_pochi"), phoneNumber: z.string().min(9), ownerName: z.string().min(1) }),
]);

const createHotelSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().min(9),
  email: z.string().email(),
  location: z.string().trim().max(160).optional(),
  address: z.string().trim().max(300).optional(),
  ownerContactName: z.string().trim().min(1).max(120),
  adminUsername: z.string().trim().min(3).max(60),
  password: z.string().min(8),
  payment: paymentDetailsSchema,
  registrationFee: z.number().min(0).max(10000),
  commissionPercent: z.number().min(0).max(10),
  loyaltyIncentivePercent: z.number().min(0).max(100).optional().default(0),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Hotel terms & conditions must be accepted to complete registration." }),
  }),
  contractDays: z.number().int().min(1).max(3650).optional().default(365),
});

/**
 * Higher registration fee -> admin is expected to set a LOWER
 * commission (per spec section 7's intent) — this is not enforced
 * mechanically (the two are independently admin-configured, since
 * the exact tradeoff curve is a business decision, not a formula),
 * but the max commission (10%) and max fee (10,000) are both hard
 * DB-level CHECK constraints (migration 019), so neither can be
 * bypassed regardless of what this endpoint does.
 */
export async function createHotel(req: AuthedRequest, res: Response, next: NextFunction) {
  const client = await pool.connect();
  try {
    const parsed = createHotelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid hotel registration.");
    }
    const d = parsed.data;

    const normalizedPhone = normalizeKenyanPhone(d.phone);
    if (!normalizedPhone) throw new ApiError(400, "INVALID_PHONE_NUMBER", "Enter a valid Kenyan phone number.");

    const passwordHash = await hashPassword(d.password);
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + d.contractDays * 24 * 60 * 60 * 1000);

    await client.query("BEGIN");

    const hotelResult = await client.query(
      `INSERT INTO hotels
         (name, location, address, contact_phone, contact_email, owner_contact_name, admin_username,
          payment_method, payment_details, registration_fee, commission_percent, loyalty_incentive_percent,
          terms_accepted, terms_accepted_at, terms_version, contract_start_date, contract_end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,now(),$13,$14,$15,'active')
       RETURNING *`,
      [
        d.name,
        d.location ?? null,
        d.address ?? null,
        normalizedPhone,
        d.email.toLowerCase(),
        d.ownerContactName,
        d.adminUsername,
        d.payment.method,
        JSON.stringify(d.payment),
        d.registrationFee,
        d.commissionPercent,
        d.loyaltyIncentivePercent,
        TERMS_VERSION,
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      ]
    );
    const hotel = hotelResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, 'hotel_owner', 'password', true, 'active')
       RETURNING id`,
      [d.email.toLowerCase(), normalizedPhone, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level)
       VALUES ($1, $2, $3, 'owner')`,
      [userId, hotel.id, d.ownerContactName]
    );

    await client.query("COMMIT");

    // Never echo the password hash back, even to the admin who just set it.
    delete hotel.payment_details_raw;
    res.status(201).json({ hotel, loginUsername: d.adminUsername, loginEmail: d.email });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string }).code === "23505") {
      next(new ApiError(409, "HOTEL_EXISTS", "A hotel or user with this email/phone/username already exists."));
      return;
    }
    next(err);
  } finally {
    client.release();
  }
}

export async function suspendHotel(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const result = await pool.query(
      "UPDATE hotels SET status = 'suspended', updated_at = now() WHERE id = $1 RETURNING id, name, status",
      [hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    res.json({ hotel: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function reactivateHotel(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const result = await pool.query(
      "UPDATE hotels SET status = 'active', updated_at = now() WHERE id = $1 RETURNING id, name, status",
      [hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    res.json({ hotel: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

const updateCommissionSchema = z.object({
  registrationFee: z.number().min(0).max(10000).optional(),
  commissionPercent: z.number().min(0).max(10).optional(),
  loyaltyIncentivePercent: z.number().min(0).max(100).optional(),
});

export async function updateHotelCommission(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;
    const parsed = updateCommissionSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    const d = parsed.data;

    const result = await pool.query(
      `UPDATE hotels SET
         registration_fee = COALESCE($1, registration_fee),
         commission_percent = COALESCE($2, commission_percent),
         loyalty_incentive_percent = COALESCE($3, loyalty_incentive_percent),
         updated_at = now()
       WHERE id = $4
       RETURNING id, name, registration_fee, commission_percent, loyalty_incentive_percent`,
      [d.registrationFee, d.commissionPercent, d.loyaltyIncentivePercent, hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    res.json({ hotel: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function listHotels(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT id, name, location, status, contract_start_date, contract_end_date,
              registration_fee, commission_percent, loyalty_incentive_percent, payment_method,
              image_url, created_at
       FROM hotels ORDER BY created_at DESC`
    );
    res.json({ hotels: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Platform-wide order view with the filters the spec calls for.
 * hotelId/studentId/status/from/to are all optional; passing none
 * returns everything (bounded to the most recent 200).
 */
export async function listAllOrders(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { hotelId, studentId, status, from, to } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (hotelId) { params.push(hotelId); conditions.push(`o.hotel_id = $${params.length}`); }
    if (studentId) { params.push(studentId); conditions.push(`o.user_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`o.status = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`o.created_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`o.created_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT o.*, h.name AS hotel_name, u.email AS student_email
       FROM orders o
       JOIN hotels h ON h.id = o.hotel_id
       JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ orders: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * status=unresolved (the default for the admin "Follow-up" list) means
 * "not yet completed" — pending/processing/failed/rejected — since
 * those are the withdrawals that still need someone's attention.
 * Passing an explicit status (including 'completed') overrides that.
 */
export async function listWithdrawals(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as string | undefined;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && status !== "unresolved") {
      params.push(status);
      conditions.push(`w.status = $${params.length}`);
    } else if (!status || status === "unresolved") {
      conditions.push(`w.status IN ('pending', 'processing', 'failed', 'rejected')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT w.*, u.email AS student_email, s.full_name AS student_name, h.name AS hotel_name
       FROM savings_withdrawals w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN students s ON s.user_id = w.user_id
       LEFT JOIN hotels h ON h.id = w.hotel_id
       ${where}
       ORDER BY w.created_at DESC LIMIT 200`,
      params
    );
    res.json({ withdrawals: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/ledger?date=YYYY-MM-DD (defaults to today)
 *
 * Every figure here comes from a real, already-frozen column —
 * nothing is estimated or extrapolated:
 *   - plansCollected: successful M-Pesa top-ups (transactions.type =
 *     'budget_topup') on that date — this is the ONLY transaction
 *     type this codebase ever actually creates (order redemption
 *     spends from an already-topped-up budget, it doesn't create a
 *     fresh transaction row).
 *   - mealsRedeemed: orders actually redeemed that date (real
 *     redeemed_at timestamp, not order-creation time).
 *   - failedPayments: failed top-up attempts that date.
 *   - commissionEarned: orders.commission_amount, frozen onto the
 *     order at redemption time (migration 020) — not recomputed here.
 */
export async function getDailyLedger(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const dateParam = req.query.date as string | undefined;
    const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    if (dateParam && !dateSchema.safeParse(dateParam).success) {
      throw new ApiError(400, "VALIDATION_ERROR", "date must be in YYYY-MM-DD format.");
    }
    const date = dateParam || null; // NULL -> CURRENT_DATE in SQL below

    const [plans, meals, failed, commission] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
         FROM transactions
         WHERE type = 'budget_topup' AND status = 'success'
           AND created_at::date = COALESCE($1::date, CURRENT_DATE)`,
        [date]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
         FROM orders
         WHERE status = 'redeemed' AND redeemed_at::date = COALESCE($1::date, CURRENT_DATE)`,
        [date]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
         FROM transactions
         WHERE status = 'failed' AND created_at::date = COALESCE($1::date, CURRENT_DATE)`,
        [date]
      ),
      pool.query(
        `SELECT COALESCE(SUM(commission_amount), 0) AS amount, COUNT(*) AS count
         FROM orders
         WHERE status = 'redeemed' AND redeemed_at::date = COALESCE($1::date, CURRENT_DATE)`,
        [date]
      ),
    ]);

    res.json({
      date: dateParam || new Date().toISOString().slice(0, 10),
      plansCollected: plans.rows[0],
      mealsRedeemed: meals.rows[0],
      failedPayments: failed.rows[0],
      commissionEarned: commission.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/hotels/top?period=today|all&limit=5
 *
 * Ranks active hotels by real redeemed-order revenue — never a
 * fabricated "popularity" score. Hotels with zero redeemed orders in
 * the window are excluded rather than shown with a misleading KSh 0.
 */
export async function getTopHotels(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const period = req.query.period === "all" ? "all" : "today";
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 20 ? Math.floor(limitParam) : 5;

    const dateFilter = period === "today" ? "AND o.redeemed_at::date = CURRENT_DATE" : "";
    const result = await pool.query(
      `SELECT h.id, h.name, h.location,
              COALESCE(SUM(o.amount), 0) AS revenue,
              COUNT(o.id) AS orders_count
       FROM hotels h
       JOIN orders o ON o.hotel_id = h.id AND o.status = 'redeemed' ${dateFilter}
       WHERE h.status = 'active'
       GROUP BY h.id
       HAVING COALESCE(SUM(o.amount), 0) > 0
       ORDER BY revenue DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ period, hotels: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/alerts
 *
 * "Needs attention" = things with a real pending action, composed
 * from two already-real states — never a synthetic health score:
 *   - hotels stuck at status='pending_verification' (an approve action
 *     genuinely exists for these — see approveHotel/reactivateHotel)
 *   - recently failed M-Pesa top-ups (real transactions.status='failed'
 *     rows, not a made-up "issue" count)
 */
export async function getAlerts(_req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const [pendingHotels, failedPayments] = await Promise.all([
      pool.query(
        `SELECT id, name, location, created_at
         FROM hotels
         WHERE status = 'pending_verification'
         ORDER BY created_at ASC
         LIMIT 10`
      ),
      pool.query(
        `SELECT t.id, t.amount, t.created_at, t.result_description,
                s.full_name AS student_name, u.email AS student_email, h.name AS hotel_name
         FROM transactions t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN students s ON s.user_id = t.user_id
         LEFT JOIN hotels h ON h.id = t.hotel_id
         WHERE t.status = 'failed'
         ORDER BY t.created_at DESC
         LIMIT 10`
      ),
    ]);

    res.json({
      pendingHotels: pendingHotels.rows,
      failedPayments: failedPayments.rows,
      totalCount: pendingHotels.rows.length + failedPayments.rows.length,
    });
  } catch (err) {
    next(err);
  }
}
