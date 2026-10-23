/**
 * What a hotel_owner / hotel_staff caller is allowed to see of an order.
 *
 * `orders` rows are read with SELECT * (columns keep being added by
 * migrations), so building the hotel-facing response by DELETING known-bad
 * keys is fragile: every new internal column would leak by default —
 * qr_token, idempotency_key, payment_transaction_id, payout_id, the paying
 * student's user_id, and MEALVEST's commission_amount. This is an
 * ALLOW-list instead: a column reaches a hotel only if it is named here.
 *
 * hotel_amount (the hotel's own net) is deliberately included;
 * commission_amount and the gross-vs-net relationship are not (see the
 * rationale on getHotelDashboard in hotel.controller.ts).
 */
export interface HotelOrderView {
  id: string;
  status: string;
  amount: string;
  hotel_amount: string | null;
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  created_at: string;
  updated_at: string;
  redeemed: boolean;
  redeemed_at: string | null;
  /** Present on list responses only (joined from students) — the name staff call out at handover. */
  student_name?: string | null;
}

export function toHotelOrderView(order: Record<string, any>): HotelOrderView {
  const view: HotelOrderView = {
    id: order.id,
    status: order.status,
    amount: order.amount,
    hotel_amount: order.hotel_amount ?? null,
    items: Array.isArray(order.items) ? order.items : [],
    created_at: order.created_at,
    updated_at: order.updated_at,
    redeemed: Boolean(order.redeemed),
    redeemed_at: order.redeemed_at ?? null,
  };
  if ("student_name" in order) view.student_name = order.student_name ?? null;
  return view;
}
