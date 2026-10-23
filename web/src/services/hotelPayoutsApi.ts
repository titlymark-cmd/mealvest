type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export interface HotelPendingBalance {
  hotel_id: string;
  hotel_name: string;
  payment_method: string | null;
  payment_details: Record<string, unknown> | null;
  pending_amount: string;
  pending_order_count: string;
  /** Decided server-side for the ACTIVE payout provider (Paystack vs Cyzora automate different settlement methods). */
  payout_supported?: boolean;
  /** Unpaid earnings are below the payout threshold: they keep accumulating and are paid automatically once the threshold is reached. */
  below_threshold?: boolean;
  /** Why AUTOMATIC payout is paused for this hotel (e.g. payout_unknown, failure_cooldown, repeated_failures), or null. */
  auto_payout_blocked_reason?: string | null;
}

export interface PendingPayoutsOverview {
  hotels: HotelPendingBalance[];
  /** Minimum unpaid balance (KSh) before a payout is created; null from an older server. */
  thresholdKes: number | null;
  /** Whether the server sends payouts automatically; null from an older server. */
  autoPayoutsEnabled: boolean | null;
}

export interface HotelPayout {
  id: string;
  hotel_id: string;
  hotel_name?: string;
  amount: string;
  /**
   * review/approved: held for an admin decision (over a limit) — not sent.
   * unknown: a send was attempted but its outcome isn't confirmed yet —
   * money may have moved; it is reconciled under the SAME reference.
   */
  status: "pending" | "review" | "approved" | "unknown" | "processing" | "successful" | "failed" | "cancelled";
  review_reason?: string | null;
  provider: string;
  transfer_reference: string;
  recipient_code: string | null;
  transfer_code: string | null;
  failure_reason: string | null;
  /** Created by the automatic trigger (no initiating admin). */
  automated?: boolean;
  /** Unconfirmed outcome, failed recently, or stuck in processing past the stale window. */
  needs_attention?: boolean;
  submitted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchPendingPayouts(authFetch: AuthFetch): Promise<HotelPendingBalance[]> {
  const res = await authFetch("/api/admin/payouts/pending");
  const data = await parseOrError<{ hotels: HotelPendingBalance[] }>(res, "Could not load pending payouts.");
  return data.hotels;
}

export async function fetchPendingPayoutsOverview(authFetch: AuthFetch): Promise<PendingPayoutsOverview> {
  const res = await authFetch("/api/admin/payouts/pending");
  const data = await parseOrError<{ hotels: HotelPendingBalance[]; threshold_kes?: number; auto_payouts_enabled?: boolean }>(
    res,
    "Could not load pending payouts."
  );
  return {
    hotels: data.hotels,
    thresholdKes: typeof data.threshold_kes === "number" ? data.threshold_kes : null,
    autoPayoutsEnabled: typeof data.auto_payouts_enabled === "boolean" ? data.auto_payouts_enabled : null,
  };
}

export async function fetchPayoutHistory(authFetch: AuthFetch): Promise<HotelPayout[]> {
  const res = await authFetch("/api/admin/payouts");
  const data = await parseOrError<{ payouts: HotelPayout[] }>(res, "Could not load payout history.");
  return data.payouts;
}

export async function triggerPayout(authFetch: AuthFetch, hotelId: string): Promise<HotelPayout> {
  const res = await authFetch("/api/admin/payouts/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId }),
  });
  const data = await parseOrError<{ payout: HotelPayout }>(res, "Could not trigger this payout.");
  return data.payout;
}

export async function refreshPayoutStatus(authFetch: AuthFetch, payoutId: string): Promise<HotelPayout> {
  const res = await authFetch(`/api/admin/payouts/${payoutId}/refresh`, { method: "POST" });
  const data = await parseOrError<{ payout: HotelPayout }>(res, "Could not refresh this payout's status.");
  return data.payout;
}

/** Approve a payout held in review — it is then sent once, under its own reference. */
export async function approvePayout(authFetch: AuthFetch, payoutId: string): Promise<HotelPayout> {
  const res = await authFetch(`/api/admin/payouts/${payoutId}/approve`, { method: "POST" });
  const data = await parseOrError<{ payout: HotelPayout }>(res, "Could not approve this payout.");
  return data.payout;
}

/** Cancel a payout that was never sent (review/approved); its orders return to the unpaid pool. */
export async function cancelPayout(authFetch: AuthFetch, payoutId: string): Promise<HotelPayout> {
  const res = await authFetch(`/api/admin/payouts/${payoutId}/cancel`, { method: "POST" });
  const data = await parseOrError<{ payout: HotelPayout }>(res, "Could not cancel this payout.");
  return data.payout;
}
