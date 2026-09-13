/**
 * Inserts demo hotels + menu items for local testing of the
 * hotel-browsing flow. Safe to re-run — skips hotels that already
 * exist by name.
 *
 * COORDINATES NOTE: "Mama Nadia's Kitchen" and "Lakeview Hotel" are
 * fictional demo businesses invented for testing — there is no real
 * establishment at these exact coordinates. The lat/lng values below
 * are real, valid points within Homa Bay Town, Kenya (~-0.5273,
 * 34.4571), offset slightly from each other so the nearby-hotels
 * distance sort has something meaningful to sort during testing.
 * When you register a REAL hotel, get its exact coordinates via
 * Google Maps (right-click the location -> copy coordinates) or the
 * admin location picker, and set them via
 * PATCH /api/hotel/location — never copy these demo values.
 *
 * Usage:
 *   node scripts/seedDemoData.js
 */
require("dotenv").config();
const { Client } = require("pg");

const HOTELS = [
  {
    name: "Mama Nadia's Kitchen",
    location: "Homa Bay Town",
    contact_phone: "254712000001",
    contact_email: "info@mamanadias.co.ke",
    payout_method: "mpesa",
    payout_account: "174379",
    latitude: -0.5273,
    longitude: 34.4571,
    address: "Kendu Bay Road, Homa Bay Town",
    helpline: "254700000001",
    opening_hours: "6:00 AM - 9:00 PM daily",
    services: ["Dine-in", "M-Pesa payment", "Boda-boda delivery"],
    description: "A student favorite for home-style Kenyan meals in the heart of Homa Bay Town.",
    menu: [
      { name: "Tea", price: 30, category: "breakfast", description: "Hot Kenyan chai" },
      { name: "Chapati", price: 30, category: "breakfast", description: "Soft layered chapati" },
      { name: "Beans + Ugali", price: 120, category: "lunch", description: "Home-style beans, ugali" },
      { name: "Beef + Ugali", price: 180, category: "lunch", description: "Beef stew, ugali" },
      { name: "Chicken + Rice", price: 250, category: "lunch", description: "Grilled chicken, rice, kachumbari" },
      { name: "Rice + Beans", price: 130, category: "dinner", description: "Rice, beans, greens" },
    ],
  },
  {
    name: "Lakeview Hotel",
    location: "Homa Bay Town",
    contact_phone: "254712000002",
    contact_email: "info@lakeviewhotel.co.ke",
    payout_method: "bank",
    payout_account: "0123456789",
    latitude: -0.5301,
    longitude: 34.4602,
    address: "Lakeside Road, near the pier, Homa Bay Town",
    helpline: "254700000002",
    opening_hours: "7:00 AM - 10:00 PM daily",
    services: ["Dine-in", "Bank transfer payment", "Lake view seating"],
    description: "Lakeside dining with a full Kenyan menu, a short walk from the ferry pier.",
    menu: [
      { name: "Egg + Mandazi", price: 50, category: "breakfast", description: "Boiled egg with mandazi" },
      { name: "Vegetables + Chapati", price: 130, category: "lunch", description: "Sukuma wiki, chapati" },
      { name: "Beef + Rice", price: 200, category: "dinner", description: "Beef stew, rice" },
      { name: "Chicken + Ugali", price: 230, category: "dinner", description: "Chicken stew, ugali" },
    ],
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const hotel of HOTELS) {
      const existing = await client.query("SELECT id FROM hotels WHERE name = $1", [hotel.name]);
      let hotelId;

      if (existing.rows.length > 0) {
        hotelId = existing.rows[0].id;
        console.log(`skip   ${hotel.name} (already exists)`);
      } else {
        const result = await client.query(
          `INSERT INTO hotels
             (name, location, contact_phone, contact_email, payout_method, payout_account, status,
              latitude, longitude, address, helpline, opening_hours, services, description)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            hotel.name,
            hotel.location,
            hotel.contact_phone,
            hotel.contact_email,
            hotel.payout_method,
            hotel.payout_account,
            hotel.latitude,
            hotel.longitude,
            hotel.address,
            hotel.helpline,
            hotel.opening_hours,
            hotel.services,
            hotel.description,
          ]
        );
        hotelId = result.rows[0].id;
        console.log(`create ${hotel.name}`);
      }

      for (const item of hotel.menu) {
        const existingItem = await client.query(
          "SELECT id FROM menu_items WHERE hotel_id = $1 AND name = $2",
          [hotelId, item.name]
        );
        if (existingItem.rows.length > 0) continue;

        await client.query(
          `INSERT INTO menu_items (hotel_id, name, description, price, category, available)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [hotelId, item.name, item.description, item.price, item.category]
        );
      }
    }

    console.log("Demo data seeded.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
