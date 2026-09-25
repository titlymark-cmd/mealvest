import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { isValidCoordinate } from "../lib/geo";

/**
 * Public browsing endpoints — deliberately NOT behind requireAuth.
 * A student needs to see which hotels exist and what they serve
 * before they've even finished onboarding, so gating this behind
 * login would block the exact flow it needs to support. Nothing
 * sensitive (prices, menu names, coordinates) is protected data —
 * admin-only fields (payout_method/payout_account) are never
 * selected here.
 */

export async function listHotels(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query(
      `SELECT id, name, location, contact_phone, latitude, longitude, image_url, description
       FROM hotels
       WHERE status = 'active'
       ORDER BY name ASC`
    );
    res.json({ hotels: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function getHotelMenu(req: Request, res: Response, next: NextFunction) {
  try {
    const { hotelId } = req.params;

    const hotelResult = await pool.query(
      `SELECT id, name, location, address, contact_phone, helpline, opening_hours,
              services, latitude, longitude, image_url, description
       FROM hotels WHERE id = $1 AND status = 'active'`,
      [hotelId]
    );
    if (hotelResult.rows.length === 0) {
      res.status(404).json({ error: { code: "HOTEL_NOT_FOUND", message: "Hotel not found." } });
      return;
    }

    const menuResult = await pool.query(
      `SELECT id, name, description, price, category, available, image_url
       FROM menu_items
       WHERE hotel_id = $1 AND available = true
       ORDER BY category, name ASC`,
      [hotelId]
    );

    res.json({ hotel: hotelResult.rows[0], menu: menuResult.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/hotels/nearby?latitude=..&longitude=..&radiusKm=..
 *
 * The Haversine formula runs directly in the SQL query, so Postgres
 * does the distance calculation and sort itself — we never pull
 * every hotel into Node just to sort a handful client-side, and the
 * student's coordinates never get to influence anything except this
 * one read-only query (they can't set a hotel's location this way,
 * only ask "what's near THIS point").
 *
 * Coordinates come from the querystring because this is a GET (no
 * body) — validated numerically before ever touching SQL.
 *
 * Note on scale: this computes Haversine distance against every
 * active hotel with coordinates set, which is fine at hotel counts
 * in the dozens-to-low-hundreds. If MEALVEST's hotel network grows much
 * larger than that, the next step is a PostGIS `geography` column +
 * a GiST index + `ST_DWithin`/`<->` KNN operator instead of this
 * formula, without changing the API shape.
 */
export async function getNearbyHotels(req: Request, res: Response, next: NextFunction) {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 15;

    if (!isValidCoordinate(latitude, longitude)) {
      res.status(400).json({
        error: { code: "INVALID_COORDINATES", message: "Valid latitude and longitude are required." },
      });
      return;
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) {
      res.status(400).json({ error: { code: "INVALID_RADIUS", message: "radiusKm must be between 0 and 100." } });
      return;
    }

    // Haversine formula in SQL. 6371 = Earth's radius in km.
    // Computed in a subquery so the outer WHERE can filter on the
    // derived distance_km column — Postgres doesn't allow HAVING to
    // act as a per-row filter without GROUP BY, which is what we
    // actually need here (every hotel row is independent, nothing is
    // being aggregated).
    const result = await pool.query(
      `SELECT * FROM (
         SELECT id, name, location, address, contact_phone, helpline, latitude, longitude, image_url, description,
                (
                  6371 * acos(
                    LEAST(1.0, GREATEST(-1.0,
                      cos(radians($1)) * cos(radians(latitude)) *
                      cos(radians(longitude) - radians($2)) +
                      sin(radians($1)) * sin(radians(latitude))
                    ))
                  )
                ) AS distance_km
         FROM hotels
         WHERE status = 'active' AND latitude IS NOT NULL AND longitude IS NOT NULL
       ) AS with_distance
       WHERE distance_km <= $3
       ORDER BY distance_km ASC
       LIMIT 20`,
      [latitude, longitude, radiusKm]
    );

    res.json({
      studentLocation: { latitude, longitude },
      nearestHotel: result.rows[0] || null,
      hotels: result.rows,
    });
  } catch (err) {
    next(err);
  }
}
