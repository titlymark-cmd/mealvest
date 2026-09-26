type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export interface AdminOverview {
  students: number;
  hotels: { total: string; active: string; suspended: string; pending: string };
  orders: {
    total: string;
    today: string;
    redeemed: string;
    pending: string;
    cancelled: string;
    gross_transaction_value: string;
    mealvest_commission: string;
  };
  withdrawals: { pending_withdrawals: string };
}

export async function fetchAdminOverview(authFetch: AuthFetch): Promise<AdminOverview> {
  const res = await authFetch("/api/admin/overview");
  return parseOrError(res, "Could not load the admin overview.");
}

export interface AdminHotel {
  id: string;
  name: string;
  location: string | null;
  status: "pending_verification" | "active" | "suspended" | "expired";
  registration_fee: string;
  commission_percent: string;
  loyalty_incentive_percent: string;
  payment_method: string | null;
  image_url: string | null;
  created_at: string;
}

export async function fetchAdminHotels(authFetch: AuthFetch): Promise<AdminHotel[]> {
  const res = await authFetch("/api/admin/hotels");
  const data = await parseOrError<{ hotels: AdminHotel[] }>(res, "Could not load hotels.");
  return data.hotels;
}

/**
 * A newly self-registered hotel starts at status='pending_verification'
 * (see authService.registerHotel). reactivateHotel's UPDATE sets
 * status='active' unconditionally, which is exactly "approve" for a
 * pending hotel — there's no separate approve endpoint because the
 * transition is identical either way (-> active).
 */
export async function approveHotel(authFetch: AuthFetch, hotelId: string): Promise<AdminHotel> {
  const res = await authFetch(`/api/admin/hotels/${hotelId}/reactivate`, { method: "PATCH" });
  const data = await parseOrError<{ hotel: AdminHotel }>(res, "Could not approve this hotel.");
  return data.hotel;
}

/**
 * Matches the backend's admin-only createHotelSchema exactly — note
 * this is a DIFFERENT (older, 3-option) payment shape than the
 * public self-registration schema's 5-option one. That's a real
 * inconsistency in the backend itself, not something papered over
 * here — the admin form below is built to match what this specific
 * endpoint actually validates.
 */
export interface CreateHotelInput {
  name: string;
  phone: string;
  email: string;
  location?: string;
  ownerContactName: string;
  adminUsername: string;
  password: string;
  payment: { method: "mpesa_till"; tillNumber: string; businessName: string };
  registrationFee: number;
  commissionPercent: number;
  termsAccepted: true;
}

export async function createHotel(authFetch: AuthFetch, input: CreateHotelInput): Promise<AdminHotel> {
  const res = await authFetch("/api/admin/hotels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ hotel: AdminHotel }>(res, "Could not register this hotel.");
  return data.hotel;
}

export async function updateHotelCommission(
  authFetch: AuthFetch,
  hotelId: string,
  commissionPercent: number
): Promise<AdminHotel> {
  const res = await authFetch(`/api/admin/hotels/${hotelId}/commission`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commissionPercent }),
  });
  const data = await parseOrError<{ hotel: AdminHotel }>(res, "Could not update commission.");
  return data.hotel;
}

export async function suspendHotel(authFetch: AuthFetch, hotelId: string): Promise<AdminHotel> {
  const res = await authFetch(`/api/admin/hotels/${hotelId}/suspend`, { method: "PATCH" });
  const data = await parseOrError<{ hotel: AdminHotel }>(res, "Could not suspend this hotel.");
  return data.hotel;
}

export interface LedgerFigure {
  amount: string;
  count: string;
}

export interface DailyLedger {
  date: string;
  plansCollected: LedgerFigure;
  mealsRedeemed: LedgerFigure;
  failedPayments: LedgerFigure;
  commissionEarned: LedgerFigure;
}

export async function fetchDailyLedger(authFetch: AuthFetch, date?: string): Promise<DailyLedger> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await authFetch(`/api/admin/ledger${qs}`);
  return parseOrError(res, "Could not load today's ledger.");
}

export interface TopHotel {
  id: string;
  name: string;
  location: string | null;
  revenue: string;
  orders_count: string;
}

export async function fetchTopHotels(authFetch: AuthFetch, period: "today" | "all" = "today"): Promise<TopHotel[]> {
  const res = await authFetch(`/api/admin/hotels/top?period=${period}`);
  const data = await parseOrError<{ hotels: TopHotel[] }>(res, "Could not load top-performing hotels.");
  return data.hotels;
}

export interface AlertPendingHotel {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
}

export interface AlertFailedPayment {
  id: string;
  amount: string;
  created_at: string;
  result_description: string | null;
  student_name: string | null;
  student_email: string;
  hotel_name: string | null;
}

export interface AdminAlerts {
  pendingHotels: AlertPendingHotel[];
  failedPayments: AlertFailedPayment[];
  totalCount: number;
}

export async function fetchAdminAlerts(authFetch: AuthFetch): Promise<AdminAlerts> {
  const res = await authFetch("/api/admin/alerts");
  return parseOrError(res, "Could not load alerts.");
}

export interface AdminOrder {
  id: string;
  hotel_id: string;
  user_id: string;
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
  amount: string;
  status: string;
  redeemed_at: string | null;
  created_at: string;
  hotel_name: string;
  student_email: string;
}

export async function fetchAllOrders(
  authFetch: AuthFetch,
  filters?: { hotelId?: string; status?: string; from?: string; to?: string }
): Promise<AdminOrder[]> {
  const params = new URLSearchParams();
  if (filters?.hotelId) params.set("hotelId", filters.hotelId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await authFetch(`/api/admin/orders${qs}`);
  const data = await parseOrError<{ orders: AdminOrder[] }>(res, "Could not load orders.");
  return data.orders;
}

export interface AdminWithdrawal {
  id: string;
  user_id: string;
  hotel_id: string | null;
  gross_savings: string;
  student_amount: string;
  hotel_incentive_amount: string;
  payout_method: string | null;
  payout_destination: string | null;
  status: string;
  created_at: string;
  student_email: string;
  student_name: string | null;
  hotel_name: string | null;
}

/** status defaults to "unresolved" (pending/processing/failed/rejected) — the admin follow-up list. */
export async function fetchWithdrawals(authFetch: AuthFetch, status?: string): Promise<AdminWithdrawal[]> {
  const qs = `?status=${encodeURIComponent(status || "unresolved")}`;
  const res = await authFetch(`/api/admin/withdrawals${qs}`);
  const data = await parseOrError<{ withdrawals: AdminWithdrawal[] }>(res, "Could not load withdrawals.");
  return data.withdrawals;
}

/** budget_* fields are null when the student has no active plan right now. */
export interface AdminStudent {
  id: string;
  email: string;
  full_name: string;
  institution: string | null;
  admission_number: string | null;
  budget_id: string | null;
  total_amount: string | null;
  remaining_amount: string | null;
  daily_allowance: string | null;
  number_of_days: number | null;
  start_date: string | null;
  end_date: string | null;
  budget_status: string | null;
  hotel_id: string | null;
  hotel_name: string | null;
}

export async function fetchAdminStudents(authFetch: AuthFetch, search?: string): Promise<AdminStudent[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await authFetch(`/api/admin/students${qs}`);
  const data = await parseOrError<{ students: AdminStudent[] }>(res, "Could not load students.");
  return data.students;
}
