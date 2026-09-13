import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { deductFromBudget } from "./budgetService";
import { generateOrderQrPayload, verifyOrderQrPayload } from "../lib/qr";

export interface CartLine {
  itemId: string;
  quantity: number;
}

interface PricedLine extends CartLine {
  name: string;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Recomputes an order total entirely from menu_items rows in
 * Postgres. The client may only say "these itemIds and quantities" —
 * never the total. This is the single most important anti-fraud
 * function in the ordering flow.
 */
export async function priceCart(hotelId: string, lines: CartLine[]): Promise<{ pricedLines: PricedLine[]; amount: number }> {
  if (!lines.length) {
    throw new ApiError(400, "INVALID_ORDER", "Your order is empty.");
  }

  const hotelResult = await pool.query("SELECT id, status FROM hotels WHERE id = $1", [hotelId]);
  if (hotelResult.rows.length === 0 || hotelResult.rows[0].status !== "active") {
    throw new ApiError(404, "HOTEL_NOT_FOUND", "This hotel is not currently available.");
  }

  const pricedLines: PricedLine[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
      throw new ApiError(400, "INVALID_ORDER", "Invalid item quantity.");
    }
    const itemResult = await pool.query(
      "SELECT id, hotel_id, name, price, available FROM menu_items WHERE id = $1",
      [line.itemId]
    );
    if (itemResult.rows.length === 0) {
      throw new ApiError(409, "ITEM_UNAVAILABLE", "One of the items in your order no longer exists.");
    }
    const item = itemResult.rows[0];
    if (item.hotel_id !== hotelId) {
      throw new ApiError(400, "INVALID_ORDER", "This item does not belong to the selected hotel.");
    }
    if (!item.available) {
      throw new ApiError(409, "ITEM_UNAVAILABLE", `${item.name} is currently unavailable.`);
    }
    const unitPrice = Number(item.price);
    const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
    pricedLines.push({ itemId: line.itemId, quantity: line.quantity, name: item.name, unitPrice, lineTotal });
  }

  const amount = Math.round(pricedLines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  return { pricedLines, amount };
}

export async function createOrder(params: { userId: string; hotelId: string; lines: CartLine[] }) {
  const { pricedLines, amount } = await priceCart(params.hotelId, params.lines);

  const result = await pool.query(
    `INSERT INTO orders (user_id, hotel_id, items, amount, status)
     VALUES ($1, $2, $3, $4, 'pending_payment')
     RETURNING *`,
    [params.userId, params.hotelId, JSON.stringify(pricedLines), amount]
  );
  return result.rows[0];
}

export async function getOrderById(orderId: string) {
  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (result.rows.length === 0) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  return result.rows[0];
}

export async function getOrdersForUser(userId: string) {
  const result = await pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [
    userId,
  ]);
  return result.rows;
}

export async function getOrdersForHotel(hotelId: string, status?: string) {
  const result = status
    ? await pool.query("SELECT * FROM orders WHERE hotel_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 100", [
        hotelId,
        status,
      ])
    : await pool.query("SELECT * FROM orders WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 100", [hotelId]);
  return result.rows;
}

/**
 * Pays for an order out of the student's already-active budget
 * (this app's model: M-Pesa/Paystack funds the BUDGET once;
 * individual meals are then paid for by spending down that budget,
 * not by a fresh charge per meal). Deducts, then mints the QR token
 * only once the order is durably marked 'paid' — never before, so a
 * QR can never exist for an order that wasn't actually paid for.
 */
export async function payOrderFromBudget(orderId: string, userId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    if (orderResult.rows.length === 0) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    }
    const order = orderResult.rows[0];

    if (order.user_id !== userId) {
      throw new ApiError(403, "FORBIDDEN", "This is not your order.");
    }
    if (order.status !== "pending_payment") {
      // Idempotency guard — re-submitting an already-paid order id
      // is a no-op that returns the existing paid order.
      await client.query("COMMIT");
      return order;
    }

    await deductFromBudget(userId, Number(order.amount));

    const qrPayload = generateOrderQrPayload(order.id);

    const updated = await client.query(
      `UPDATE orders SET status = 'paid', qr_token = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [qrPayload, orderId]
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The ONLY function that can mark an order 'redeemed'. Called by the
 * hotel's QR scanner after a successful decode. Everything the spec
 * asks for happens here in one atomic transaction:
 *   - signature verification (throws first if forged/malformed)
 *   - hotel ownership check (this order belongs to THIS hotel)
 *   - hotel ACTIVE check (a suspended hotel cannot redeem, even for
 *     an order that was placed before suspension)
 *   - payment status check (must be 'paid')
 *   - double-redemption check (must not already be 'redeemed')
 *   - commission calculation, frozen onto the order at this exact
 *     moment using the hotel's CURRENT commission_percent
 *   - the state flip, via SELECT...FOR UPDATE so two hotel devices
 *     scanning the same QR in true parallel can't both win.
 */
export async function redeemOrderByQr(qrPayload: string, hotelId: string, redeemedByUserId: string) {
  const { orderId } = verifyOrderQrPayload(qrPayload);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    if (orderResult.rows.length === 0) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "No matching order found for this QR code.");
    }
    const order = orderResult.rows[0];

    if (order.hotel_id !== hotelId) {
      throw new ApiError(403, "FORBIDDEN", "This meal belongs to a different hotel.");
    }

    const hotelResult = await client.query("SELECT status, commission_percent FROM hotels WHERE id = $1", [hotelId]);
    const hotel = hotelResult.rows[0];
    if (!hotel || hotel.status !== "active") {
      throw new ApiError(403, "HOTEL_SUSPENDED", "This hotel account is not currently active.");
    }

    if (order.status === "redeemed") {
      throw new ApiError(409, "ALREADY_REDEEMED", "This QR code has already been redeemed.");
    }
    if (order.status !== "paid") {
      throw new ApiError(409, "NOT_PAID", "This order has not been paid for.");
    }

    const commissionPercent = Number(hotel.commission_percent);
    const amount = Number(order.amount);
    const commissionAmount = Math.round(amount * (commissionPercent / 100) * 100) / 100;
    const hotelAmount = Math.round((amount - commissionAmount) * 100) / 100;

    const updated = await client.query(
      `UPDATE orders SET status = 'redeemed', redeemed = TRUE, redeemed_at = now(),
              redeemed_by_hotel_user_id = $1, commission_amount = $2, hotel_amount = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [redeemedByUserId, commissionAmount, hotelAmount, orderId]
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read-only counterpart to redeemOrderByQr — lets the hotel's
 * scanner UI show "valid, KSh 250, Chicken + Rice" BEFORE staff
 * commit to redeeming, without mutating anything.
 */
export async function verifyOrderQr(qrPayload: string, hotelId: string) {
  const { orderId } = verifyOrderQrPayload(qrPayload);

  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (result.rows.length === 0) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "No matching order found for this QR code.");
  }
  const order = result.rows[0];

  if (order.hotel_id !== hotelId) {
    throw new ApiError(403, "FORBIDDEN", "This meal belongs to a different hotel.");
  }
  if (order.status === "redeemed") {
    throw new ApiError(409, "ALREADY_REDEEMED", "This QR code has already been redeemed.");
  }
  if (order.status !== "paid") {
    throw new ApiError(409, "NOT_PAID", "This order has not been paid for.");
  }

  return order;
}

/**
 * Only one legitimate transition exists outside of payment/redemption:
 * paid -> ready (the hotel marking a meal as prepared and waiting for
 * pickup). Every other transition (to 'redeemed') only ever happens
 * through the QR flow above — this function deliberately does not
 * accept 'redeemed' as a target status, so a hotel can never mark an
 * order redeemed without a real, signature-verified QR scan.
 */
export async function markOrderReady(orderId: string, hotelId: string) {
  const result = await pool.query(
    `UPDATE orders SET status = 'ready', updated_at = now()
     WHERE id = $1 AND hotel_id = $2 AND status = 'paid'
     RETURNING *`,
    [orderId, hotelId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      "This order cannot be marked ready — it may already be ready, redeemed, or belong to a different hotel."
    );
  }
  return result.rows[0];
}
