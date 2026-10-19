import { fetchHotels, fetchHotelMenu, Hotel, MenuItem } from "./hotelsApi";

/**
 * Public (logged-out) hotel data. Everything comes from the existing public
 * endpoints, GET /api/hotels and GET /api/hotels/:id/menu, which already
 * return only ACTIVE hotels and AVAILABLE menu items and select no
 * admin/settlement/payout fields. Nothing here is mocked.
 *
 * The list is cached for the session so Landing -> Hotels doesn't refetch;
 * a failed load is never cached, so Retry always makes a real request.
 */
let listPromise: Promise<Hotel[]> | null = null;

export function loadPublicHotels(force = false): Promise<Hotel[]> {
  if (!listPromise || force) {
    const p = fetchHotels();
    listPromise = p;
    p.catch(() => {
      if (listPromise === p) listPromise = null;
    });
  }
  return listPromise;
}

export async function loadHotelMenuPreview(hotelId: string, limit = 3): Promise<MenuItem[]> {
  const { menu } = await fetchHotelMenu(hotelId);
  return menu.slice(0, limit);
}

/** Groups menu rows by category, preserving the API's order. Blank categories become "Other". */
export function groupMenu(menu: MenuItem[]): { category: string; items: MenuItem[] }[] {
  const map = new Map<string, MenuItem[]>();
  for (const item of menu) {
    const key = item.category?.trim() || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map, ([category, items]) => ({ category, items }));
}

/** Case-insensitive match on the fields the list endpoint actually returns. */
export function filterHotels(hotels: Hotel[], query: string): Hotel[] {
  const q = query.trim().toLowerCase();
  if (!q) return hotels;
  return hotels.filter((h) => [h.name, h.location, h.description].some((f) => (f || "").toLowerCase().includes(q)));
}

/**
 * Picks the hotels to feature on the landing page. Deterministic, and based
 * only on real fields: hotels with a photo first, then by number of reviews,
 * then name. This is "which hotels show a good card", not a ranking claim.
 */
export function pickFeatured(hotels: Hotel[], count = 3): Hotel[] {
  return [...hotels]
    .sort((a, b) => {
      const img = Number(Boolean(b.image_url)) - Number(Boolean(a.image_url));
      if (img) return img;
      const rev = (b.review_count ?? 0) - (a.review_count ?? 0);
      if (rev) return rev;
      return a.name.localeCompare(b.name);
    })
    .slice(0, count);
}
