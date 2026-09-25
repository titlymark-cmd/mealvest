export interface OrderItem {
  itemId: string;
  quantity: number;
}

export interface Order {
  id: string;
  user_id: string;
  hotel_id: string;
  items: Array<{ itemId: string; quantity: number; name: string; unitPrice: number; lineTotal: number }>;
  amount: string;
  status: "pending_payment" | "paid" | "ready" | "redeemed" | "cancelled" | "refunded";
  qr_token: string | null;
  commission_amount: string | null;
  hotel_amount: string | null;
  created_at: string;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export async function createOrder(authFetch: AuthFetch, hotelId: string, items: OrderItem[]): Promise<Order> {
  const res = await authFetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId, items }),
  });
  const data = await parseOrError<{ order: Order }>(res, "Could not create your order.");
  return data.order;
}

/**
 * Pays for an already-created order out of the student's active
 * budget. This is the ONLY thing that ever produces a qr_token — the
 * frontend never generates or guesses one, it always comes back from
 * this exact call, straight from the backend's HMAC-signed value.
 */
export async function payOrder(authFetch: AuthFetch, orderId: string): Promise<Order> {
  const res = await authFetch(`/api/orders/${orderId}/pay`, { method: "POST" });
  const data = await parseOrError<{ order: Order }>(res, "Could not pay for this order.");
  return data.order;
}

export async function getOrder(authFetch: AuthFetch, orderId: string): Promise<Order> {
  const res = await authFetch(`/api/orders/${orderId}`);
  const data = await parseOrError<{ order: Order }>(res, "Could not load this order.");
  return data.order;
}

export async function listMyOrders(authFetch: AuthFetch): Promise<Order[]> {
  const res = await authFetch("/api/orders");
  const data = await parseOrError<{ orders: Order[] }>(res, "Could not load your orders.");
  return data.orders;
}
