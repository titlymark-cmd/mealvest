import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { updateHotelLocationSchema } from "../schemas/hotelLocationSchema";
import * as orderService from "../services/orderService";
import { uploadHotelImage } from "../services/storageService";
import { imageUrlSchema } from "../schemas/hotelLocationSchema";
import { toHotelOrderView } from "../lib/hotelOrderView";
import { env } from "../config/env";
import { getUnpaidBalance, autoPayoutBlockReason } from "../models/hotelPayoutModel";
import { effectiveCommissionSql } from "../lib/hotelCommission";
import { zone as businessTimezone } from "../lib/businessTime";

/** Upper bound for a single menu item (M9) — far above any real meal, well inside NUMERIC(10,2). */
const MAX_MENU_PRICE = 10_000;

/**
 * Resolves the hotel_id for the currently authenticated hotel_owner/
 * hotel_staff user via hotel_staff, rather than trusting a hotelId
 * in the request body. Also rejects if that hotel is suspended —
 * previously only redeemOrderByQr checked this (the most sensitive
 * single action), which left every OTHER hotel-scoped endpoint
 * (dashboard, order list, menu view/edit, location edit) reachable
 * with a still-valid token even after suspension. Centralizing the
 * check here, in the one function every hotel-scoped controller
 * already calls, closes that gap in one place rather than needing it
 * repeated in each controller.
 */
async function getOwnHotelId(userId: string): Promise<string> {
  const result = await pool.query(
    "SELECT hs.hotel_id, h.status FROM hotel_staff hs JOIN hotels h ON h.id = hs.hotel_id WHERE hs.user_id = $1",
    [userId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(403, "NOT_HOTEL_STAFF", "This account is not linked to a hotel.");
  }
  if (result.rows[0].status !== "active") {
    throw new ApiError(403, "HOTEL_SUSPENDED", "This hotel account is not currently active.");
  }
  return result.rows[0].hotel_id;
}

/**
 * Extends hotel resolution for mealvest_admin: a hotel_staff/owner
 * user always gets THEIR OWN hotel via getOwnHotelId (unchanged —
 * they have no way to specify a different one, by design). An admin
 * has no row in hotel_staff at all, so they must explicitly name
 * which hotel they're viewing via ?hotelId=; this is oversight
 * (viewing), not impersonation — an admin still can't redeem a QR or
 * edit a menu as if they were that hotel's own staff, since those
 * routes stay restricted to hotel_staff/hotel_owner only (see
 * hotel.routes.ts) — admin gets read access to dashboard/orders/menu
 * views, nothing that mutates the hotel's own operational data.
 */
async function resolveHotelId(req: AuthedRequest): Promise<string> {
  if (req.user!.role === "mealvest_admin") {
    const hotelId = req.query.hotelId as string | undefined;
    if (!hotelId) {
      throw new ApiError(400, "HOTEL_ID_REQUIRED", "Specify ?hotelId=<id> to view a hotel as admin.");
    }
    const exists = await pool.query("SELECT id FROM hotels WHERE id = $1", [hotelId]);
    if (exists.rows.length === 0) {
      throw new ApiError(404, "HOTEL_NOT_FOUND", "No hotel found with that ID.");
    }
    return hotelId;
  }
  return getOwnHotelId(req.user!.id);
}

/**
 * Real dashboard summary: today's/pending/redeemed order counts,
 * revenue, net earnings, and contract/status info — all computed live
 * from `orders`/`hotels`, never hardcoded numbers.
 *
 * MEALVEST's commission (the platform's own cut) is a business term
 * between MEALVEST and the hotel, not something the hotel's own
 * dashboard displays — hotel_owner/hotel_staff callers get
 * `revenue_today`/`net_earnings` computed from orders.hotel_amount
 * (what the hotel actually receives), with commission_percent,
 * commission_owed, and gross_revenue all omitted entirely (not just
 * hidden in the UI — showing gross next to net would let a hotel back
 * out the exact commission by subtraction, so gross never reaches this
 * response for them). mealvest_admin, viewing a specific hotel via
 * ?hotelId= for oversight, still gets the full figure set unchanged.
 */
export async function getHotelDashboard(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    const isAdminView = req.user!.role === "mealvest_admin";

    const [hotelResult, statsResult, menuCountResult] = await Promise.all([
      pool.query(
        // The owner-editable profile fields (PATCH /api/hotel/location accepts
        // latitude/longitude/address/helpline/opening_hours/services/description/
        // image_url) MUST be readable here too, otherwise the profile form can't
        // load what it's editing. The remaining added columns are read-only
        // registration facts the owner already supplied. Deliberately still
        // excluded: kra_pin, business_registration_number, contact_id_number,
        // commission, paystack_recipient_code, application/review internals.
        `SELECT id, name, status, location, address, settlement_schedule, contract_start_date, contract_end_date,
                ${isAdminView ? `${effectiveCommissionSql("hotels")}::numeric(5,2) AS commission_percent, (commission_override_percent IS NOT NULL) AS commission_is_override,` : ""}
                payout_mode, to_char(payout_time, 'HH24:MI') AS payout_time,
                registration_fee, payment_method, payment_details,
                payment_verification_status,
                image_url, description, latitude, longitude, helpline, opening_hours, closing_hours, days_open, services,
                business_type, county, town, landmark, contact_phone, contact_email, whatsapp_number
         FROM hotels WHERE id = $1`,
        [hotelId]
      ),
      isAdminView
        ? pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today_orders,
               COUNT(*) FILTER (WHERE status = 'paid') AS pending_orders,
               COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed_orders,
               COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
               COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed'), 0) AS gross_revenue,
               COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed' AND redeemed_at::date = CURRENT_DATE), 0) AS revenue_today,
               COALESCE(SUM(commission_amount) FILTER (WHERE status = 'redeemed'), 0) AS commission_owed,
               COALESCE(SUM(hotel_amount) FILTER (WHERE status = 'redeemed'), 0) AS net_earnings
             FROM orders WHERE hotel_id = $1`,
            [hotelId]
          )
        : pool.query(
            `SELECT
               COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today_orders,
               COUNT(*) FILTER (WHERE status = 'paid') AS pending_orders,
               COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed_orders,
               COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
               COALESCE(SUM(hotel_amount) FILTER (WHERE status = 'redeemed' AND redeemed_at::date = CURRENT_DATE), 0) AS revenue_today,
               COALESCE(SUM(hotel_amount) FILTER (WHERE status = 'redeemed'), 0) AS net_earnings
             FROM orders WHERE hotel_id = $1`,
            [hotelId]
          ),
      pool.query("SELECT COUNT(*) AS menu_item_count FROM menu_items WHERE hotel_id = $1", [hotelId]),
    ]);

    if (hotelResult.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    const hotel = hotelResult.rows[0];

    res.json({
      hotel,
      stats: { ...statsResult.rows[0], menu_item_count: menuCountResult.rows[0].menu_item_count },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hotel/revenue/weekly — real day-by-day redeemed revenue for
 * the trailing 7 days (including today), one row per day even when a
 * day has zero orders (generate_series, not just grouping existing
 * rows) so the frontend can plot a full week without gaps.
 *
 * Sums orders.hotel_amount (net, after MEALVEST's commission), not the
 * gross order amount — this chart is "the hotel's own revenue," and
 * gross would only invite back-calculating the commission against
 * net_earnings elsewhere on the same dashboard.
 */
export async function getHotelWeeklyRevenue(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    const result = await pool.query(
      `SELECT d::date AS day,
              COALESCE(SUM(o.hotel_amount) FILTER (WHERE o.status = 'redeemed' AND o.redeemed_at::date = d::date), 0) AS revenue
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d
       LEFT JOIN orders o ON o.hotel_id = $1
       GROUP BY d
       ORDER BY d ASC`,
      [hotelId]
    );
    res.json({ days: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hotel/students?search=<name> — students who have (or have
 * had) an actual budget/plan tied to THIS hotel specifically — the
 * JOIN LATERAL is an inner join in effect, so a student with zero
 * budgets at this hotel simply never appears, rather than showing
 * every platform student with a blank plan.
 */
export async function listHotelStudents(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    const search = (req.query.search as string | undefined)?.trim();
    const params: unknown[] = [hotelId];
    let searchClause = "";
    if (search) {
      params.push(`%${search}%`);
      searchClause = `AND s.full_name ILIKE $${params.length}`;
    }

    const result = await pool.query(
      `SELECT u.id, u.email, s.full_name, s.institution,
              b.id AS budget_id, b.total_amount, b.remaining_amount, b.daily_allowance,
              b.number_of_days, b.start_date, b.end_date, b.status AS budget_status
       FROM users u
       JOIN students s ON s.user_id = u.id
       JOIN LATERAL (
         SELECT * FROM budgets WHERE budgets.user_id = u.id AND budgets.hotel_id = $1
         ORDER BY budgets.created_at DESC LIMIT 1
       ) b ON true
       WHERE u.role = 'student' ${searchClause}
       ORDER BY s.full_name ASC
       LIMIT 300`,
      params
    );
    res.json({ students: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hotel/payouts — the hotel's own settlement picture: what it has
 * earned but not yet been paid (redeemed orders not claimed by any payout),
 * what has been paid out, and the payout history.
 *
 * Read-only and scoped to the caller's own hotel (or ?hotelId= for admin
 * oversight). Money figures are all hotel_amount / payout amounts — the
 * hotel's net — so, like the dashboard, nothing here lets a hotel back out
 * MEALVEST's commission. Internal payout columns (provider, recipient and
 * transfer codes, which admin approved it, review reason, the provider's raw
 * failure text) are intentionally not selected.
 */
export async function getHotelPayouts(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    const [unpaid, blockReason, totals, history, modeRow] = await Promise.all([
      // The same authoritative "payable balance" the payout engine itself uses.
      getUnpaidBalance(hotelId),
      env.autoPayoutsEnabled
        ? autoPayoutBlockReason(hotelId, env.autoPayoutMaxConsecutiveFailures, env.autoPayoutFailureCooldownMinutes)
        : Promise.resolve(null),
      pool.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'successful'), 0) AS paid_out_total,
                MAX(updated_at) FILTER (WHERE status = 'successful') AS last_paid_at
         FROM hotel_payouts WHERE hotel_id = $1`,
        [hotelId]
      ),
      pool.query(
        `SELECT id, amount, status, transfer_reference AS reference,
                (initiated_by_admin_id IS NULL) AS automated, created_at, updated_at
         FROM hotel_payouts WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [hotelId]
      ),
      // The hotel's own payout schedule (mode + time). Never the commission:
      // like the dashboard, nothing here lets a hotel back out MEALVEST's rate.
      pool.query("SELECT payout_mode, to_char(payout_time, 'HH24:MI') AS payout_time FROM hotels WHERE id = $1", [hotelId]),
    ]);
    // The engine's internal block reasons are collapsed to three hotel-safe categories.
    const autoHold =
      blockReason === null
        ? null
        : blockReason.startsWith("payout_")
        ? "payout_in_progress"
        : blockReason === "failure_cooldown"
        ? "failed_recently"
        : "needs_support";
    res.json({
      summary: {
        pending_amount: unpaid.total,
        pending_order_count: String(unpaid.orderCount),
        ...totals.rows[0],
        auto_enabled: env.autoPayoutsEnabled,
        threshold: String(env.autoPayoutThresholdKes),
        auto_hold: autoHold,
        payout_mode: modeRow.rows[0]?.payout_mode ?? "instant",
        payout_time: modeRow.rows[0]?.payout_time ?? null,
        payout_timezone: businessTimezone(),
      },
      payouts: history.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateHotelLocation(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateHotelLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid request.");
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "No fields to update.");
    }

    const hotelId = await getOwnHotelId(req.user!.id);
    const d = parsed.data;

    const result = await pool.query(
      `UPDATE hotels SET
         latitude = COALESCE($1, latitude),
         longitude = COALESCE($2, longitude),
         address = COALESCE($3, address),
         helpline = COALESCE($4, helpline),
         opening_hours = COALESCE($5, opening_hours),
         services = COALESCE($6, services),
         description = COALESCE($7, description),
         image_url = COALESCE($8, image_url)
       WHERE id = $9
       RETURNING id, name, latitude, longitude, address, helpline, opening_hours, services, description, image_url`,
      [d.latitude, d.longitude, d.address, d.helpline, d.openingHours, d.services, d.description, d.imageUrl, hotelId]
    );

    res.json({ hotel: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

const qrSchema = z.object({ qrPayload: z.string().min(1) });


/** Read-only pre-check — the scanner UI shows details before staff commit to redeeming. */
export async function verifyQr(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = qrSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "qrPayload is required.");

    const hotelId = await getOwnHotelId(req.user!.id);
    const order = await orderService.verifyOrderQr(parsed.data.qrPayload, hotelId);
    res.json({ valid: true, order: toHotelOrderView(order) });
  } catch (err) {
    if (err instanceof ApiError) {
      res.json({ valid: false, code: err.code, message: err.message });
      return;
    }
    next(err);
  }
}

/** The ONLY endpoint that can mark a meal redeemed. Atomic at the DB level. */
export async function redeemQr(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = qrSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "qrPayload is required.");

    const hotelId = await getOwnHotelId(req.user!.id);
    const order = await orderService.redeemOrderByQr(parsed.data.qrPayload, hotelId, req.user!.id);
    res.json({ valid: true, order: toHotelOrderView(order), message: "Meal redeemed successfully." });
  } catch (err) {
    if (err instanceof ApiError) {
      res.json({ valid: false, code: err.code, message: err.message });
      return;
    }
    next(err);
  }
}

export async function listHotelOrders(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    const orders = await orderService.getOrdersForHotel(hotelId, req.query.status as string | undefined);
    const isAdminView = req.user!.role === "mealvest_admin";
    res.json({ orders: isAdminView ? orders : orders.map(toHotelOrderView) });
  } catch (err) {
    next(err);
  }
}

export async function markOrderReady(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await getOwnHotelId(req.user!.id);
    const order = await orderService.markOrderReady(req.params.orderId, hotelId);
    res.json({ order: toHotelOrderView(order) });
  } catch (err) {
    next(err);
  }
}

/**
 * Real device/file upload for hotel + meal photos — the frontend's
 * image field used to only accept a pasted URL (see migration 024's
 * own comment: "real device upload becomes a client-side-only
 * addition later, writing to this same column"). This is that
 * addition: it returns a real hosted URL, and the existing
 * updateHotelLocation/addMenuItem/updateMenuItem endpoints — already
 * expecting an `imageUrl` string — are completely unchanged; the
 * frontend just puts the URL this returns into that same field
 * instead of one a hotel typed in by hand. A hotel can still paste an
 * external URL directly if it prefers to.
 *
 * `itemId`, when present, scopes the object path under that specific
 * menu item (still validated as belonging to THIS hotel — an id for a
 * different hotel's item is rejected, not just used as a path label)
 * so a meal's photos land under hotel/{hotelId}/meals/{itemId}/...
 * rather than the hotel's own cover/gallery path.
 */
export async function uploadImage(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await getOwnHotelId(req.user!.id);
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "VALIDATION_ERROR", "No image file was provided.");
    }

    const itemId = typeof req.body?.itemId === "string" && req.body.itemId ? req.body.itemId : null;
    let pathPrefix = `hotel/${hotelId}/cover`;
    if (itemId) {
      const owns = await pool.query("SELECT id FROM menu_items WHERE id = $1 AND hotel_id = $2", [itemId, hotelId]);
      if (owns.rows.length === 0) {
        throw new ApiError(404, "ITEM_NOT_FOUND", "Menu item not found.");
      }
      pathPrefix = `hotel/${hotelId}/meals/${itemId}`;
    }

    const url = await uploadHotelImage(pathPrefix, file);
    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
}

// -----------------------------------------------------------------
// Menu management — already specified (hotel dashboard "manage menu"
// requirement) but never wired to a route. Scoped to the caller's
// own hotel via getOwnHotelId, same as every other hotel endpoint.
// -----------------------------------------------------------------
const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional(),
  price: z.number().positive().max(MAX_MENU_PRICE, `Price can't exceed KSh ${MAX_MENU_PRICE}.`).finite(),
  category: z.enum(["breakfast", "lunch", "dinner", "snacks", "drinks", "other"]).default("other"),
  imageUrl: imageUrlSchema.optional(),
});

export async function listOwnMenu(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);
    // Unlike the public GET /api/hotels/:id/menu (available items
    // only), this returns EVERYTHING including unavailable items —
    // a hotel managing its own menu needs to see what it's hidden,
    // not just what students currently see.
    const result = await pool.query(
      "SELECT * FROM menu_items WHERE hotel_id = $1 ORDER BY category, name",
      [hotelId]
    );
    res.json({ items: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function addMenuItem(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = menuItemSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid item.");

    const hotelId = await getOwnHotelId(req.user!.id);
    const d = parsed.data;
    const result = await pool.query(
      `INSERT INTO menu_items (hotel_id, name, description, price, category, available, image_url)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING *`,
      [hotelId, d.name, d.description ?? null, d.price, d.category, d.imageUrl ?? null]
    );
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(300).optional(),
  price: z.number().positive().max(MAX_MENU_PRICE, `Price can't exceed KSh ${MAX_MENU_PRICE}.`).finite().optional(),
  category: z.enum(["breakfast", "lunch", "dinner", "snacks", "drinks", "other"]).optional(),
  available: z.boolean().optional(),
  imageUrl: imageUrlSchema.optional(),
});

export async function updateMenuItem(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updateMenuItemSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid update.");

    const hotelId = await getOwnHotelId(req.user!.id);
    const d = parsed.data;

    // hotel_id = $7 in the WHERE clause, not just id = $itemId — a
    // hotel can only ever edit ITS OWN menu items, never another
    // hotel's, even if they somehow guessed a valid item id.
    const result = await pool.query(
      `UPDATE menu_items SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         category = COALESCE($4, category),
         available = COALESCE($5, available),
         image_url = COALESCE($6, image_url)
       WHERE id = $7 AND hotel_id = $8
       RETURNING *`,
      [d.name, d.description, d.price, d.category, d.available, d.imageUrl, req.params.itemId, hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "ITEM_NOT_FOUND", "Menu item not found.");
    res.json({ item: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Hard delete — safe because orders.items is a JSONB snapshot taken
 * at order time (see migration 014), not a foreign key to menu_items,
 * so removing a menu item never orphans or corrupts past order
 * history. hotel_id = $2 in the WHERE clause, same "only your own
 * hotel's items" scoping as updateMenuItem.
 */
export async function deleteMenuItem(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await getOwnHotelId(req.user!.id);
    const result = await pool.query(
      "DELETE FROM menu_items WHERE id = $1 AND hotel_id = $2 RETURNING id",
      [req.params.itemId, hotelId]
    );
    if (result.rows.length === 0) throw new ApiError(404, "ITEM_NOT_FOUND", "Menu item not found.");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
