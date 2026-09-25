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
  if (!res.ok) throw new Error("Could not load this hotel's menu.");
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
