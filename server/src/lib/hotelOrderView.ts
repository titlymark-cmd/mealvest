/**
 * What a hotel_owner / hotel_staff caller is allowed to see of an order.
 *
 * `orders` rows are read with SELECT * (columns keep being added by
 * migrations), so building the hotel-facing response by DELETING known-bad
 * keys is fragile: every new internal column would leak by default —
 * qr_token, idempotency_key, payment_transaction_id, payout_id, the paying
 * student's user_id. The order's payout fee is included for a transparent
 * hotel earnings breakdown.
 * ALLOW-list instead: a column reaches a hotel only if it is named here.
 *
 * amount, commission_amount, and hotel_amount represent gross, fee, and
 * net respectively.
 */
export interface HotelOrderView {
  id: string;
  status: string;
  amount: string;
  payout_fee_amount: string | null;
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
    payout_fee_amount: order.commission_amount ?? null,
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
