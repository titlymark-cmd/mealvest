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
