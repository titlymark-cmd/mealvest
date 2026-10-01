import { pool } from "../config/db";

export interface HotelPayoutRow {
  id: string;
  hotel_id: string;
  amount: string;
  status: "pending" | "processing" | "successful" | "failed";
  provider: string;
  transfer_reference: string;
  recipient_code: string | null;
  transfer_code: string | null;
  failure_reason: string | null;
  initiated_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HotelPendingBalance {
  hotel_id: string;
  hotel_name: string;
  payment_method: string | null;
  payment_details: Record<string, unknown> | null;
  pending_amount: string;
  pending_order_count: string;
}

/** Every hotel with at least one redeemed-but-unpaid order, and how much it's owed — the admin payout screen's main list. */
export async function listHotelsWithPendingBalance(): Promise<HotelPendingBalance[]> {
  const result = await pool.query<HotelPendingBalance>(
    `SELECT h.id AS hotel_id, h.name AS hotel_name, h.payment_method, h.payment_details,
            COALESCE(SUM(o.hotel_amount), 0) AS pending_amount,
            COUNT(o.id) AS pending_order_count
     FROM hotels h
     JOIN orders o ON o.hotel_id = h.id AND o.redeemed = true AND o.payout_id IS NULL
     GROUP BY h.id, h.name, h.payment_method, h.payment_details
     HAVING COALESCE(SUM(o.hotel_amount), 0) > 0
     ORDER BY pending_amount DESC`
  );
  return result.rows;
}

export async function getHotelPaymentDetails(
  hotelId: string
): Promise<{ payment_method: string | null; payment_details: Record<string, unknown> | null; paystack_recipient_code: string | null } | null> {
  const result = await pool.query(
    "SELECT payment_method, payment_details, paystack_recipient_code FROM hotels WHERE id = $1",
    [hotelId]
  );
  return result.rows[0] ?? null;
}

export async function saveRecipientCode(hotelId: string, recipientCode: string): Promise<void> {
  await pool.query("UPDATE hotels SET paystack_recipient_code = $1 WHERE id = $2", [recipientCode, hotelId]);
}

/**
 * Atomically computes a hotel's current pending balance, claims every
 * qualifying order for this one payout (payout_id = the new row), and
 * creates the hotel_payouts row — all inside one transaction with a
 * row lock on the qualifying orders, so two "Pay out" clicks racing
 * each other can never both claim the same order's hotel_amount (the
 * second one simply sees zero unclaimed orders left and is rejected
 * by the caller before any Paystack call happens).
 */
export async function claimPendingOrdersForPayout(
  hotelId: string,
  transferReference: string,
  initiatedByAdminId: string
): Promise<HotelPayoutRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ordersResult = await client.query(
      "SELECT id, hotel_amount FROM orders WHERE hotel_id = $1 AND redeemed = true AND payout_id IS NULL FOR UPDATE",
      [hotelId]
    );
    if (ordersResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const total = ordersResult.rows.reduce((sum, row) => sum + Number(row.hotel_amount), 0);
    const orderIds = ordersResult.rows.map((row) => row.id);

    const payoutResult = await client.query<HotelPayoutRow>(
      `INSERT INTO hotel_payouts (hotel_id, amount, transfer_reference, initiated_by_admin_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [hotelId, total, transferReference, initiatedByAdminId]
    );
    const payout = payoutResult.rows[0];

    await client.query("UPDATE orders SET payout_id = $1 WHERE id = ANY($2::uuid[])", [payout.id, orderIds]);

    await client.query("COMMIT");
    return payout;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Releases claimed orders back to the pool (payout_id = NULL) when a payout fails outright — e.g. Paystack rejects recipient creation before any transfer was attempted. Never done once a transfer was actually initiated (that outcome is tracked on the payout row itself, not undone). */
export async function releaseClaimedOrders(payoutId: string): Promise<void> {
  await pool.query("UPDATE orders SET payout_id = NULL WHERE payout_id = $1", [payoutId]);
}

export async function updatePayoutAfterInitiate(
  payoutId: string,
  fields: { status: HotelPayoutRow["status"]; recipientCode?: string; transferCode?: string; failureReason?: string }
): Promise<HotelPayoutRow> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts
     SET status = $2, recipient_code = COALESCE($3, recipient_code), transfer_code = COALESCE($4, transfer_code), failure_reason = $5
     WHERE id = $1 RETURNING *`,
    [payoutId, fields.status, fields.recipientCode ?? null, fields.transferCode ?? null, fields.failureReason ?? null]
  );
  return result.rows[0];
}

export async function getPayoutByReference(transferReference: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>("SELECT * FROM hotel_payouts WHERE transfer_reference = $1", [
    transferReference,
  ]);
  return result.rows[0] ?? null;
}

export async function getPayoutById(payoutId: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>("SELECT * FROM hotel_payouts WHERE id = $1", [payoutId]);
  return result.rows[0] ?? null;
}

/** For a payout that already moved past 'pending' (a transfer_code exists), idempotently applies a verified status — safe to call repeatedly from an admin refresh action or the Paystack webhook. */
export async function finalizePayoutStatus(
  payoutId: string,
  status: "successful" | "failed",
  failureReason: string | null
): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts SET status = $2, failure_reason = $3
     WHERE id = $1 AND status = 'processing' RETURNING *`,
    [payoutId, status, failureReason]
  );
  return result.rows[0] ?? null;
}

export async function listPayoutsForHotel(hotelId: string): Promise<HotelPayoutRow[]> {
  const result = await pool.query<HotelPayoutRow>(
    "SELECT * FROM hotel_payouts WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 50",
    [hotelId]
  );
  return result.rows;
}

export async function listAllPayouts(): Promise<(HotelPayoutRow & { hotel_name: string })[]> {
  const result = await pool.query<HotelPayoutRow & { hotel_name: string }>(
    `SELECT p.*, h.name AS hotel_name FROM hotel_payouts p JOIN hotels h ON h.id = p.hotel_id
     ORDER BY p.created_at DESC LIMIT 100`
  );
  return result.rows;
}
