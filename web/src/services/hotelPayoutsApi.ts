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
}

export interface HotelPayout {
  id: string;
  hotel_id: string;
  hotel_name?: string;
  amount: string;
  status: "pending" | "processing" | "successful" | "failed";
  provider: string;
  transfer_reference: string;
  recipient_code: string | null;
  transfer_code: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchPendingPayouts(authFetch: AuthFetch): Promise<HotelPendingBalance[]> {
  const res = await authFetch("/api/admin/payouts/pending");
  const data = await parseOrError<{ hotels: HotelPendingBalance[] }>(res, "Could not load pending payouts.");
  return data.hotels;
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
