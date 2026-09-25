type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export interface HotelDashboard {
  hotel: {
    id: string;
    name: string;
    status: string;
    commission_percent: string;
    registration_fee: string;
    payment_method: string | null;
  };
  stats: {
    today_orders: string;
    pending_orders: string;
    redeemed_orders: string;
    gross_revenue: string;
    commission_owed: string;
    net_earnings: string;
  };
}

export async function fetchHotelDashboard(authFetch: AuthFetch): Promise<HotelDashboard> {
  const res = await authFetch("/api/hotel/dashboard");
  return parseOrError(res, "Could not load your dashboard.");
}

export interface HotelOrder {
  id: string;
  status: string;
  amount: string;
  items: Array<{ name: string; quantity: number }>;
  created_at: string;
}

export async function fetchHotelOrders(authFetch: AuthFetch, status?: string): Promise<HotelOrder[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await authFetch(`/api/hotel/orders${qs}`);
  const data = await parseOrError<{ orders: HotelOrder[] }>(res, "Could not load orders.");
  return data.orders;
}

/** Marks a paid order 'ready' — the one legitimate manual status transition. */
export async function markOrderReady(authFetch: AuthFetch, orderId: string): Promise<HotelOrder> {
  const res = await authFetch(`/api/hotel/orders/${orderId}/ready`, { method: "PATCH" });
  const data = await parseOrError<{ order: HotelOrder }>(res, "Could not update this order.");
  return data.order;
}

export interface HotelMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  category: string;
  available: boolean;
  image_url: string | null;
}

export async function fetchOwnMenu(authFetch: AuthFetch): Promise<HotelMenuItem[]> {
  const res = await authFetch("/api/hotel/menu");
  const data = await parseOrError<{ items: HotelMenuItem[] }>(res, "Could not load your menu.");
  return data.items;
}

export async function addMenuItem(
  authFetch: AuthFetch,
  input: { name: string; description?: string; price: number; category: string; imageUrl?: string }
): Promise<HotelMenuItem> {
  const res = await authFetch("/api/hotel/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ item: HotelMenuItem }>(res, "Could not add this item.");
  return data.item;
}

export async function updateMenuItem(
  authFetch: AuthFetch,
  itemId: string,
  input: Partial<{ name: string; description: string; price: number; category: string; available: boolean; imageUrl: string }>
): Promise<HotelMenuItem> {
  const res = await authFetch(`/api/hotel/menu/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ item: HotelMenuItem }>(res, "Could not update this item.");
  return data.item;
}

/**
 * Real backend result shape — `valid: false` is a NORMAL response
 * (invalid QR, already redeemed, wrong hotel, unpaid order), not an
 * HTTP error. The scanner UI branches on `valid`, not on a thrown
 * exception, for all of the "this QR doesn't work" cases.
 */
export interface QrCheckResult {
  valid: boolean;
  order?: {
    id: string;
    status: string;
    amount: string;
    items: Array<{ name: string; quantity: number }>;
    commission_amount?: string;
    hotel_amount?: string;
  };
  code?: string;
  message?: string;
}

export async function verifyQr(authFetch: AuthFetch, qrPayload: string): Promise<QrCheckResult> {
  const res = await authFetch("/api/hotel/qr/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qrPayload }),
  });
  return parseOrError(res, "Could not verify this QR code.");
}

/**
 * The ONLY call that actually redeems a meal. Atomic on the backend
 * (SELECT...FOR UPDATE) — calling this twice for the same QR always
 * results in the second call returning valid:false, never a double
 * redemption, regardless of how fast the two calls arrive.
 */
export async function redeemQr(authFetch: AuthFetch, qrPayload: string): Promise<QrCheckResult> {
  const res = await authFetch("/api/hotel/qr/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qrPayload }),
  });
  return parseOrError(res, "Could not redeem this QR code.");
}
