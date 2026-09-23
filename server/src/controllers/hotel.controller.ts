import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { updateHotelLocationSchema } from "../schemas/hotelLocationSchema";
import * as orderService from "../services/orderService";

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
 * revenue, commission owed, net earnings, and contract/status info —
 * all computed live from `orders`/`hotels`, never hardcoded numbers.
 */
export async function getHotelDashboard(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await resolveHotelId(req);

    const hotelResult = await pool.query(
      `SELECT id, name, status, contract_start_date, contract_end_date,
              commission_percent, registration_fee, payment_method, payment_details
       FROM hotels WHERE id = $1`,
      [hotelId]
    );
    if (hotelResult.rows.length === 0) throw new ApiError(404, "HOTEL_NOT_FOUND", "Hotel not found.");
    const hotel = hotelResult.rows[0];

    const statsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS today_orders,
         COUNT(*) FILTER (WHERE status = 'paid') AS pending_orders,
         COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed_orders,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
         COALESCE(SUM(amount) FILTER (WHERE status = 'redeemed'), 0) AS gross_revenue,
         COALESCE(SUM(commission_amount) FILTER (WHERE status = 'redeemed'), 0) AS commission_owed,
         COALESCE(SUM(hotel_amount) FILTER (WHERE status = 'redeemed'), 0) AS net_earnings
       FROM orders WHERE hotel_id = $1`,
      [hotelId]
    );

    res.json({ hotel, stats: statsResult.rows[0] });
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
         description = COALESCE($7, description)
       WHERE id = $8
       RETURNING id, name, latitude, longitude, address, helpline, opening_hours, services, description`,
      [d.latitude, d.longitude, d.address, d.helpline, d.openingHours, d.services, d.description, hotelId]
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
    res.json({ valid: true, order });
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
    res.json({ valid: true, order, message: "Meal redeemed successfully." });
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
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

export async function markOrderReady(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const hotelId = await getOwnHotelId(req.user!.id);
    const order = await orderService.markOrderReady(req.params.orderId, hotelId);
    res.json({ order });
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
  price: z.number().positive(),
  category: z.enum(["breakfast", "lunch", "dinner", "snacks", "drinks", "other"]).default("other"),
  imageUrl: z.string().trim().url("Enter a valid image URL.").max(2000).optional(),
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
  price: z.number().positive().optional(),
  category: z.enum(["breakfast", "lunch", "dinner", "snacks", "drinks", "other"]).optional(),
  available: z.boolean().optional(),
  imageUrl: z.string().trim().url("Enter a valid image URL.").max(2000).optional(),
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
