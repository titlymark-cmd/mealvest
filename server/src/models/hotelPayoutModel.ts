import { PoolClient } from "pg";
import { pool } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

export type PayoutStatus =
  | "pending"
  | "review"
  | "approved"
  | "unknown"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled";

export interface HotelPayoutRow {
  id: string;
  hotel_id: string;
  amount: string;
  status: PayoutStatus;
  provider: string;
  transfer_reference: string;
  recipient_code: string | null;
  transfer_code: string | null; // Paystack transfer code, or Cyzora's payout id (what payout.* webhooks are matched on)
  failure_reason: string | null;
  initiated_by_admin_id: string | null;
  review_reason?: string | null;
  approved_by_admin_id?: string | null;
  approved_at?: string | null;
  submitted_at?: string | null;
  submission_attempts?: number;
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

export interface PayoutLimits {
  /** A single payout above this is held in 'review' for an admin decision. */
  perPayoutMaxKes: number;
  /** Total payouts created per business day above this are held in 'review'. */
  dailyMaxKes: number;
}

async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically claims every redeemed-but-unpaid order for this hotel into
 * ONE new payout row. The hotel row is locked first, so two "Pay out"
 * clicks serialize; the second sees no unclaimed orders (or hits the
 * one-unsent-payout-per-hotel index) and never reaches the provider.
 *
 * The total is summed in SQL NUMERIC (exact). Limits are checked here,
 * inside the same transaction: an over-limit payout is created in
 * 'review' and is never sent until an admin approves it.
 */
export async function claimPendingOrdersForPayout(
  hotelId: string,
  transferReference: string,
  initiatedByAdminId: string | null,
  provider: "paystack" | "cyzora",
  limits: PayoutLimits,
  minTotalKes?: number
): Promise<HotelPayoutRow | null> {
  return inTx(async (client) => {
    const hotel = await client.query("SELECT id FROM hotels WHERE id = $1 FOR UPDATE", [hotelId]);
    if (hotel.rows.length === 0) return null;

    const ordersResult = await client.query<{ id: string }>(
      "SELECT id FROM orders WHERE hotel_id = $1 AND redeemed = true AND payout_id IS NULL FOR UPDATE",
      [hotelId]
    );
    if (ordersResult.rows.length === 0) return null;
    const orderIds = ordersResult.rows.map((r) => r.id);

    const totalResult = await client.query<{ total: string }>(
      "SELECT COALESCE(SUM(hotel_amount), 0)::numeric(12,2)::text AS total FROM orders WHERE id = ANY($1::uuid[])",
      [orderIds]
    );
    const total = totalResult.rows[0].total;
    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      // Nothing payable (e.g. 100% commission orders) — leave orders unclaimed.
      return null;
    }
    // Business threshold (automated payouts): evaluated HERE, under the
    // hotel row lock and over the exact SQL NUMERIC total, so two
    // concurrent evaluations can never both see "below" then both pay.
    // Below the threshold nothing is claimed: the earnings simply stay
    // unpaid (payout_id IS NULL) and keep accumulating.
    if (minTotalKes !== undefined && totalNum < minTotalKes) {
      return null;
    }

    const todayResult = await client.query<{ sum: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM hotel_payouts
        WHERE status NOT IN ('failed', 'cancelled') AND created_at >= date_trunc('day', now())`
    );
    const todayTotal = Number(todayResult.rows[0].sum);

    let status: PayoutStatus = "pending";
    let reviewReason: string | null = null;
    if (totalNum > limits.perPayoutMaxKes) {
      status = "review";
      reviewReason = `Amount KSh ${total} exceeds the per-payout limit of KSh ${limits.perPayoutMaxKes}`;
    } else if (todayTotal + totalNum > limits.dailyMaxKes) {
      status = "review";
      reviewReason = `Today's payouts would exceed the daily limit of KSh ${limits.dailyMaxKes}`;
    }

    let payout: HotelPayoutRow;
    try {
      const payoutResult = await client.query<HotelPayoutRow>(
        `INSERT INTO hotel_payouts (hotel_id, amount, transfer_reference, initiated_by_admin_id, provider, status, review_reason)
         VALUES ($1, $2::numeric, $3, $4, $5, $6, $7) RETURNING *`,
        [hotelId, total, transferReference, initiatedByAdminId, provider, status, reviewReason]
      );
      payout = payoutResult.rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ApiError(409, "PAYOUT_ALREADY_PENDING", "This hotel already has a payout waiting to be sent or reviewed.");
      }
      throw err;
    }

    await client.query("UPDATE orders SET payout_id = $1 WHERE id = ANY($2::uuid[])", [payout.id, orderIds]);
    return payout;
  });
}

/**
 * Claims the right to SEND a payout: pending/approved -> unknown, in one
 * conditional UPDATE. Exactly one caller can win; everyone else gets
 * null. The row is marked 'unknown' BEFORE the provider is called, so if
 * the process dies mid-request the record correctly says "outcome not
 * known" and nothing will ever release its orders or re-send it under a
 * new reference.
 */
export async function markSubmitting(payoutId: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts
        SET status = 'unknown', submitted_at = now(), submission_attempts = submission_attempts + 1,
            failure_reason = NULL
      WHERE id = $1 AND status IN ('pending', 'approved')
      RETURNING *`,
    [payoutId]
  );
  return result.rows[0] ?? null;
}

/** Records an additional re-send attempt of an 'unknown' payout under the SAME reference. */
export async function recordResendAttempt(payoutId: string): Promise<void> {
  await pool.query(
    "UPDATE hotel_payouts SET submission_attempts = submission_attempts + 1, submitted_at = now() WHERE id = $1 AND status = 'unknown'",
    [payoutId]
  );
}

/** The provider accepted the transfer: unknown -> processing | successful. */
export async function recordSendAccepted(
  payoutId: string,
  fields: { status: "processing" | "successful"; transferCode?: string | null; recipientCode?: string | null }
): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts
        SET status = $2, transfer_code = COALESCE($3, transfer_code), recipient_code = COALESCE($4, recipient_code),
            failure_reason = NULL
      WHERE id = $1 AND status = 'unknown'
      RETURNING *`,
    [payoutId, fields.status, fields.transferCode ?? null, fields.recipientCode ?? null]
  );
  return result.rows[0] ?? null;
}

/** Outcome still unknown — keep the status, record why (for the admin screen). */
export async function recordUnknownOutcome(payoutId: string, reason: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    "UPDATE hotel_payouts SET failure_reason = $2, last_reconciled_at = now() WHERE id = $1 AND status = 'unknown' RETURNING *",
    [payoutId, reason.slice(0, 500)]
  );
  return result.rows[0] ?? null;
}

export async function touchReconciled(payoutId: string): Promise<void> {
  await pool.query("UPDATE hotel_payouts SET last_reconciled_at = now() WHERE id = $1", [payoutId]);
}

/**
 * Moves a payout to a confirmed final state, and — for 'failed' and
 * 'cancelled' only — releases its orders back to the unpaid pool, in
 * the SAME transaction, and only if this call actually performed the
 * transition (so orders are released at most once and never for a
 * payout that was concurrently marked successful).
 */
export async function transitionToFinal(
  payoutId: string,
  to: "successful" | "failed" | "cancelled",
  from: PayoutStatus[],
  extra: { failureReason?: string | null; adminId?: string | null; transferCode?: string | null } = {}
): Promise<HotelPayoutRow | null> {
  return inTx(async (client) => {
    const result = await client.query<HotelPayoutRow>(
      `UPDATE hotel_payouts
          SET status = $2,
              failure_reason = CASE WHEN $2 = 'successful' THEN NULL ELSE COALESCE($4, failure_reason) END,
              transfer_code = COALESCE($6, transfer_code),
              cancelled_by_admin_id = CASE WHEN $2 = 'cancelled' THEN $5::uuid ELSE cancelled_by_admin_id END,
              cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END,
              last_reconciled_at = now()
        WHERE id = $1 AND status = ANY($3::text[])
        RETURNING *`,
      [payoutId, to, from, extra.failureReason ?? null, extra.adminId ?? null, extra.transferCode ?? null]
    );
    const row = result.rows[0] ?? null;
    if (row && (to === "failed" || to === "cancelled")) {
      await client.query("UPDATE orders SET payout_id = NULL WHERE payout_id = $1", [payoutId]);
    }
    return row;
  });
}

/**
 * review -> approved, with dual control (M8): the approving admin must
 * differ from the initiating admin. The condition is part of the single
 * UPDATE, so two simultaneous requests can't bypass it; migration 049's
 * trigger enforces the same rule in the database.
 */
export async function approvePayout(payoutId: string, adminId: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts SET status = 'approved', approved_by_admin_id = $2, approved_at = now()
      WHERE id = $1 AND status = 'review'
        AND (initiated_by_admin_id IS NULL OR initiated_by_admin_id <> $2)
      RETURNING *`,
    [payoutId, adminId]
  );
  return result.rows[0] ?? null;
}

/**
 * Claims a bounded batch of unresolved payouts for the reconciliation
 * cron. SKIP LOCKED + a short lease means overlapping cron runs never
 * work on the same payout at the same time.
 */
export async function claimForReconciliation(limit: number): Promise<HotelPayoutRow[]> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts SET reconcile_claimed_until = now() + interval '10 minutes'
      WHERE id IN (
        SELECT id FROM hotel_payouts
         WHERE status IN ('unknown', 'processing')
           AND (reconcile_claimed_until IS NULL OR reconcile_claimed_until < now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [limit]
  );
  return result.rows;
}

export async function getPayoutByReference(transferReference: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>("SELECT * FROM hotel_payouts WHERE transfer_reference = $1", [
    transferReference,
  ]);
  return result.rows[0] ?? null;
}

/** Reverse lookup by the PROVIDER's own payout id (transfer_code) — how a Cyzora payout.* webhook finds its row (index from migration 040). */
export async function getPayoutByProviderId(provider: string, providerPayoutId: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>(
    "SELECT * FROM hotel_payouts WHERE provider = $1 AND transfer_code = $2",
    [provider, providerPayoutId]
  );
  return result.rows[0] ?? null;
}

export async function getPayoutById(payoutId: string): Promise<HotelPayoutRow | null> {
  const result = await pool.query<HotelPayoutRow>("SELECT * FROM hotel_payouts WHERE id = $1", [payoutId]);
  return result.rows[0] ?? null;
}

export async function listPayoutsForHotel(hotelId: string): Promise<HotelPayoutRow[]> {
  const result = await pool.query<HotelPayoutRow>(
    "SELECT * FROM hotel_payouts WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 50",
    [hotelId]
  );
  return result.rows;
}

export type AdminPayoutRow = HotelPayoutRow & {
  hotel_name: string;
  automated: boolean; // created by the automatic trigger (no initiating admin)
  needs_attention: boolean; // unknown, stuck 'processing' past the stale window, or failed
};

export async function listAllPayouts(staleProcessingMinutes = 120): Promise<AdminPayoutRow[]> {
  const result = await pool.query<AdminPayoutRow>(
    `SELECT p.*, h.name AS hotel_name,
            (p.initiated_by_admin_id IS NULL) AS automated,
            (p.status = 'unknown'
             OR (p.status = 'failed' AND p.updated_at > now() - interval '7 days')
             OR (p.status = 'processing' AND COALESCE(p.submitted_at, p.created_at) < now() - make_interval(mins => $1::int))) AS needs_attention
       FROM hotel_payouts p JOIN hotels h ON h.id = p.hotel_id
      ORDER BY p.created_at DESC LIMIT 100`,
    [Math.ceil(staleProcessingMinutes)]
  );
  return result.rows;
}

export interface UnpaidBalance {
  total: string; // exact NUMERIC as text, 2dp
  orderCount: number;
}

/** Redeemed-but-unclaimed earnings for a hotel — the authoritative "payable balance" (SUM of orders.hotel_amount where payout_id IS NULL). */
export async function getUnpaidBalance(hotelId: string): Promise<UnpaidBalance> {
  const r = await pool.query<{ total: string; n: string }>(
    `SELECT COALESCE(SUM(hotel_amount), 0)::numeric(12,2)::text AS total, COUNT(*)::text AS n
       FROM orders WHERE hotel_id = $1 AND redeemed = true AND payout_id IS NULL`,
    [hotelId]
  );
  return { total: r.rows[0].total, orderCount: Number(r.rows[0].n) };
}

/** Hotels whose unpaid balance is already at/above the threshold — the sweep's work list. */
export async function listHotelIdsAtOrAboveThreshold(minKes: number, limit: number): Promise<string[]> {
  const r = await pool.query<{ hotel_id: string }>(
    `SELECT hotel_id FROM orders WHERE redeemed = true AND payout_id IS NULL
      GROUP BY hotel_id HAVING SUM(hotel_amount) >= $1::numeric
      ORDER BY SUM(hotel_amount) DESC LIMIT $2`,
    [minKes, limit]
  );
  return r.rows.map((x) => x.hotel_id);
}

/**
 * Why AUTOMATIC payout is paused for this hotel (null = free to go).
 * Uses only existing columns. Manual admin payout ignores this.
 *  - another payout is pending/review/approved/unknown: an uncertain or
 *    unsent payout must be resolved before another is initiated.
 *    ('processing' does not block: its funds are already reserved by
 *    that payout; newer earnings are distinct funds.)
 *  - the last N payouts all failed, or the latest failed recently:
 *    no unbounded automatic retrying.
 */
export async function autoPayoutBlockReason(hotelId: string, maxFailures: number, cooldownMinutes: number): Promise<string | null> {
  const open = await pool.query<{ status: string }>(
    "SELECT status FROM hotel_payouts WHERE hotel_id = $1 AND status IN ('pending','review','approved','unknown') LIMIT 1",
    [hotelId]
  );
  if (open.rows[0]) return `payout_${open.rows[0].status}`;
  const recent = await pool.query<{ status: string; recent: boolean }>(
    `SELECT status, (updated_at > now() - make_interval(mins => $2::int)) AS recent
       FROM hotel_payouts WHERE hotel_id = $1 AND status IN ('failed','successful')
      ORDER BY created_at DESC LIMIT $3`,
    [hotelId, Math.ceil(cooldownMinutes), Math.ceil(maxFailures)]
  );
  let consecutive = 0;
  for (const row of recent.rows) {
    if (row.status !== "failed") break;
    consecutive++;
  }
  if (consecutive >= maxFailures) return "repeated_failures";
  if (recent.rows[0]?.status === "failed" && recent.rows[0].recent) return "failure_cooldown";
  return null;
}

/**
 * Payouts left in 'pending' (claimed, never sent — e.g. the process died
 * between claim and send). 'pending' means NO provider call was made
 * (markSubmitting flips to 'unknown' BEFORE the call), so sending is
 * safe. Leased + SKIP LOCKED like claimForReconciliation.
 */
export async function claimStalePending(limit: number, olderThanMinutes: number): Promise<HotelPayoutRow[]> {
  const result = await pool.query<HotelPayoutRow>(
    `UPDATE hotel_payouts SET reconcile_claimed_until = now() + interval '10 minutes'
      WHERE id IN (
        SELECT id FROM hotel_payouts
         WHERE status = 'pending'
           AND created_at < now() - make_interval(mins => $2::int)
           AND (reconcile_claimed_until IS NULL OR reconcile_claimed_until < now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [limit, Math.ceil(olderThanMinutes)]
  );
  return result.rows;
}
