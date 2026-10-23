type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

/**
 * commission_percent/commission_owed/gross_revenue are deliberately
 * NOT in this type — the backend (hotel.controller.ts getHotelDashboard)
 * never sends them to a hotel_owner/hotel_staff caller, only to
 * mealvest_admin viewing a hotel for oversight. revenue_today/
 * net_earnings here are already net (after MEALVEST's commission) —
 * this IS the hotel's own revenue.
 */
export interface HotelDashboard {
  hotel: {
    id: string;
    name: string;
    status: string;
    location: string | null;
    address: string | null;
    settlement_schedule: string | null;
    registration_fee: string;
    payment_method: string | null;
    image_url: string | null;
    description: string | null;
    // --- Owner-editable via PATCH /api/hotel/location (see HotelProfileUpdate) ---
    latitude?: number | null;
    longitude?: number | null;
    helpline?: string | null;
    opening_hours?: string | null;
    services?: string[] | null;
    // --- Read-only registration / agreement facts (no owner write path) ---
    contract_start_date?: string | null;
    contract_end_date?: string | null;
    payment_details?: Record<string, unknown> | null;
    payment_verification_status?: string | null;
    closing_hours?: string | null;
    days_open?: string[] | null;
    business_type?: string | null;
    county?: string | null;
    town?: string | null;
    landmark?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    whatsapp_number?: string | null;
  };
  stats: {
    today_orders: string;
    pending_orders: string;
    redeemed_orders: string;
    /** Returned by GET /api/hotel/dashboard but previously undeclared/unused. */
    cancelled_orders?: string;
    revenue_today: string;
    net_earnings: string;
    menu_item_count: string;
  };
}

export async function fetchHotelDashboard(authFetch: AuthFetch): Promise<HotelDashboard> {
  const res = await authFetch("/api/hotel/dashboard");
  return parseOrError(res, "Could not load your dashboard.");
}

export interface HotelLocationUpdate {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  helpline: string | null;
  opening_hours: string | null;
  services: string[];
  description: string | null;
  image_url: string | null;
}

/**
 * Exactly the fields PATCH /api/hotel/location accepts (updateHotelLocationSchema).
 * Only send what changed: the backend uses COALESCE, so an omitted field is
 * left untouched, and an empty body is rejected.
 */
export interface HotelProfileUpdate {
  latitude?: number;
  longitude?: number;
  address?: string;
  helpline?: string;
  openingHours?: string;
  services?: string[];
  description?: string;
  imageUrl?: string;
}

export async function updateHotelProfile(
  authFetch: AuthFetch,
  input: HotelProfileUpdate
): Promise<HotelLocationUpdate> {
  const res = await authFetch("/api/hotel/location", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ hotel: HotelLocationUpdate }>(res, "Could not save your changes.");
  return data.hotel;
}

export interface HotelOrder {
  id: string;
  status: string;
  amount: string;
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  created_at: string;
  // The fields below are returned by the backend's hotel order view
  // (server/src/lib/hotelOrderView.ts) and were not previously typed or shown.
  /** The hotel's own net for this order — set once the order is redeemed. */
  hotel_amount?: string | null;
  updated_at?: string;
  redeemed?: boolean;
  redeemed_at?: string | null;
  /** List responses only: the paying student's name, for handover at the counter. */
  student_name?: string | null;
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

/**
 * Real file upload — returns a hosted URL that the caller then passes
 * into updateHotelProfile/addMenuItem/updateMenuItem's existing
 * `imageUrl` field, exactly as if it had been typed in by hand. No
 * Content-Type header here: the browser sets the correct multipart
 * boundary itself for a FormData body, and would only get it wrong if
 * we tried to set it manually.
 */
export async function uploadHotelImage(authFetch: AuthFetch, file: File, itemId?: string): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  if (itemId) form.append("itemId", itemId);

  const res = await authFetch("/api/hotel/upload-image", { method: "POST", body: form });
  const data = await parseOrError<{ url: string }>(res, "Image upload failed. Please try again.");
  return data.url;
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

export async function deleteMenuItem(authFetch: AuthFetch, itemId: string): Promise<void> {
  const res = await authFetch(`/api/hotel/menu/${itemId}`, { method: "DELETE" });
  await parseOrError(res, "Could not remove this item.");
}

export interface WeeklyRevenueDay {
  day: string;
  revenue: string;
}

export async function fetchHotelWeeklyRevenue(authFetch: AuthFetch): Promise<WeeklyRevenueDay[]> {
  const res = await authFetch("/api/hotel/revenue/weekly");
  const data = await parseOrError<{ days: WeeklyRevenueDay[] }>(res, "Could not load this week's revenue.");
  return data.days;
}

/** budget_* fields are null when the student has no plan tied to this hotel right now (their most recent one wasn't active). */
export interface HotelStudent {
  id: string;
  email: string;
  full_name: string;
  institution: string | null;
  budget_id: string | null;
  total_amount: string | null;
  remaining_amount: string | null;
  daily_allowance: string | null;
  number_of_days: number | null;
  start_date: string | null;
  end_date: string | null;
  budget_status: string | null;
}

export async function fetchHotelStudents(authFetch: AuthFetch, search?: string): Promise<HotelStudent[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await authFetch(`/api/hotel/students${qs}`);
  const data = await parseOrError<{ students: HotelStudent[] }>(res, "Could not load your students.");
  return data.students;
}

/**
 * GET /api/hotel/payouts (hotel_owner only). Amounts are the hotel's own net.
 * `status` mirrors hotel_payouts.status; the UI maps it to plain-language
 * labels rather than showing the raw value.
 */
export type HotelPayoutStatus =
  | "pending"
  | "review"
  | "approved"
  | "unknown"
  | "processing"
  | "successful"
  | "failed"
  | "cancelled";

export interface HotelPayoutRecord {
  id: string;
  amount: string;
  status: HotelPayoutStatus;
  reference: string;
  /** True when created by the automatic threshold trigger rather than an admin. */
  automated: boolean;
  created_at: string;
  updated_at: string;
}

export interface HotelEarnings {
  summary: {
    /** Redeemed-but-not-yet-paid-out earnings. */
    pending_amount: string;
    pending_order_count: string;
    paid_out_total: string;
    last_paid_at: string | null;
    /** Automatic payouts master switch (server AUTO_PAYOUTS_ENABLED). */
    auto_enabled: boolean;
    /** Minimum accumulated balance (KSh) before an automatic payout is made. */
    threshold: string;
    /** Why the next automatic payout is waiting — hotel-safe categories only. */
    auto_hold: "payout_in_progress" | "failed_recently" | "needs_support" | null;
  };
  payouts: HotelPayoutRecord[];
}

export async function fetchHotelEarnings(authFetch: AuthFetch): Promise<HotelEarnings> {
  const res = await authFetch("/api/hotel/payouts");
  return parseOrError(res, "Could not load your earnings.");
}
