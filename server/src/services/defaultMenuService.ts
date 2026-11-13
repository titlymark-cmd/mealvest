import { PoolClient } from "pg";
import { pool } from "../config/db";

export const DEFAULT_CATEGORY_SLUGS = ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"] as const;

export interface DefaultMenuCategory {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DefaultMenuItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listDefaultMenuCategories(client = pool): Promise<DefaultMenuCategory[]> {
  const result = await client.query(
    `SELECT * FROM default_menu_categories WHERE is_active = TRUE ORDER BY sort_order, label, slug`
  );
  return result.rows as DefaultMenuCategory[];
}

export async function listDefaultMenuItems(client = pool): Promise<DefaultMenuItem[]> {
  const result = await client.query(
    `SELECT * FROM default_menu_items WHERE is_active = TRUE ORDER BY category, sort_order, name`
  );
  return result.rows as DefaultMenuItem[];
}

export async function cloneDefaultMenuForHotel(hotelId: string, client: typeof pool | PoolClient = pool): Promise<{ cloned: number }> {
  const existing = await client.query("SELECT COUNT(*)::int AS count FROM menu_items WHERE hotel_id = $1", [hotelId]);
  if (Number(existing.rows[0].count) > 0) {
    return { cloned: 0 };
  }

  const defaults = await client.query(
    `SELECT category, name, description, price, image_url
     FROM default_menu_items
     WHERE is_active = TRUE
     ORDER BY sort_order, name`
  );

  for (const item of defaults.rows) {
    await client.query(
      `INSERT INTO menu_items (hotel_id, name, description, price, category, available, image_url)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
      [hotelId, item.name, item.description ?? null, item.price, item.category, item.image_url ?? null]
    );
  }

  return { cloned: defaults.rows.length };
}

export async function initializeEmptyHotelMenu(
  hotelId: string,
  client: typeof pool | PoolClient = pool
): Promise<{ initialized: boolean; cloned: number; reason: "initialized" | "already_populated" | "no_default_items" }> {
  const hotelRow = await client.query("SELECT id FROM hotels WHERE id = $1 FOR UPDATE", [hotelId]);
  if (hotelRow.rows.length === 0) {
    throw new Error("HOTEL_NOT_FOUND");
  }

  const existing = await client.query("SELECT COUNT(*)::int AS count FROM menu_items WHERE hotel_id = $1", [hotelId]);
  if (Number(existing.rows[0].count) > 0) {
    return { initialized: false, cloned: 0, reason: "already_populated" };
  }

  const defaults = await client.query(
    `SELECT category, name, description, price, image_url
     FROM default_menu_items
     WHERE is_active = TRUE
     ORDER BY sort_order, name`
  );

  if (defaults.rows.length === 0) {
    return { initialized: false, cloned: 0, reason: "no_default_items" };
  }

  for (const item of defaults.rows) {
    await client.query(
      `INSERT INTO menu_items (hotel_id, name, description, price, category, available, image_url)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
      [hotelId, item.name, item.description ?? null, item.price, item.category, item.image_url ?? null]
    );
  }

  return { initialized: true, cloned: defaults.rows.length, reason: "initialized" };
}

export async function ensureHotelMenuInitialized(hotelId: string, client: typeof pool | PoolClient = pool): Promise<{ cloned: number }> {
  return cloneDefaultMenuForHotel(hotelId, client);
}
