import { API_BASE_URL } from "./config";

export interface Hotel {
  id: string;
  name: string;
  location: string | null;
  contact_phone: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  helpline?: string | null;
  opening_hours?: string | null;
  services?: string[];
  image_url?: string | null;
  description?: string | null;
  distance_km?: number;
  review_count?: number;
  average_rating?: string | number | null;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string; // numeric comes back as string from pg via JSON
  category: string;
  available: boolean;
  image_url: string | null;
}

export async function fetchHotels(): Promise<Hotel[]> {
  const res = await fetch(`${API_BASE_URL}/api/hotels`);
  if (!res.ok) throw new Error("Could not load hotels.");
  const data = await res.json();
  return data.hotels;
}

export async function fetchHotelMenu(hotelId: string): Promise<{ hotel: Hotel; menu: MenuItem[] }> {
  const res = await fetch(`${API_BASE_URL}/api/hotels/${hotelId}/menu`);
  if (!res.ok) {
    // Keep the HTTP status so callers can tell "this hotel isn't available"
    // (404 — not found, or no longer active) from a transient failure.
    const err = new Error(res.status === 404 ? "This hotel isn't available." : "Could not load this hotel's menu.") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export interface NearbyHotelsResult {
  studentLocation: { latitude: number; longitude: number };
  nearestHotel: Hotel | null;
  hotels: Hotel[];
}

/**
 * Real distance calculation happens server-side (Haversine in SQL —
 * see server/src/controllers/hotels.controller.ts). This function
 * just forwards the device's coordinates and returns what the
 * backend computed; it never sorts or calculates distance itself.
 */
export async function fetchNearbyHotels(
  latitude: number,
  longitude: number,
  radiusKm = 15
): Promise<NearbyHotelsResult> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusKm: String(radiusKm),
  });
  const res = await fetch(`${API_BASE_URL}/api/hotels/nearby?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Could not find hotels near you.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface HotelReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  reviewer: string;
}

export interface HotelReviewSummary {
  count: number;
  average: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export async function fetchHotelReviews(hotelId: string): Promise<{ summary: HotelReviewSummary; reviews: HotelReview[] }> {
  const res = await fetch(`${API_BASE_URL}/api/hotels/${hotelId}/reviews`);
  if (!res.ok) throw new Error("Could not load reviews.");
  return res.json();
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface MyHotelReview {
  eligible: boolean;
  reason: "NO_REDEEMED_ORDER" | null;
  review: { id: string; rating: number; comment: string | null; created_at: string; updated_at: string } | null;
}

/** Whether the signed-in student may review this hotel (needs a redeemed order there) and their existing review, if any. */
export async function fetchMyHotelReview(authFetch: AuthFetch, hotelId: string): Promise<MyHotelReview> {
  const res = await authFetch(`/api/hotels/${hotelId}/reviews/me`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Could not load your review.");
  return data;
}

export async function submitHotelReview(
  authFetch: AuthFetch,
  hotelId: string,
  input: { rating: number; comment?: string | null }
): Promise<MyHotelReview["review"]> {
  const res = await authFetch(`/api/hotels/${hotelId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Could not save your review.");
  return data.review;
}

export async function deleteMyHotelReview(authFetch: AuthFetch, hotelId: string): Promise<void> {
  const res = await authFetch(`/api/hotels/${hotelId}/reviews/me`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Could not remove your review.");
  }
}
