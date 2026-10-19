/**
 * DEV-ONLY helper: give a hotel a working owner login on your LOCAL database.
 *
 *   node scripts/devHotelLogin.js "Mama Nadia" owner@mamanadias.test DevPass123!
 *
 * - Finds the hotel whose name starts with the given text.
 * - If it already has an owner account: resets that account's password,
 *   clears its PIN (you'll be asked to create a new 4-digit PIN at login)
 *   and clears any lockout. The email argument is ignored in that case.
 * - If it has no owner: creates one (role hotel_owner) with that email.
 *
 * Refuses to run against anything except localhost / 127.0.0.1, so it
 * can never touch your Supabase (production) database.
 */
require("dotenv").config();
const { Client } = require("pg");
const bcrypt = require("bcrypt");

async function main() {
  const [namePrefix, email, password] = process.argv.slice(2);
  if (!namePrefix || !email || !password) {
    console.error('Usage: node scripts/devHotelLogin.js "<hotel name start>" <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL || "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1"].includes(host)) {
    console.error("Refusing: DATABASE_URL is not a local database. This helper is for local development only.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const hotels = await client.query("SELECT id, name FROM hotels WHERE name ILIKE $1 ORDER BY created_at", [`${namePrefix}%`]);
    if (hotels.rows.length !== 1) {
      throw new Error(
        hotels.rows.length === 0
          ? `No hotel found starting with "${namePrefix}".`
          : `More than one hotel matches: ${hotels.rows.map((h) => h.name).join(", ")}. Be more specific.`
      );
    }
    const hotel = hotels.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    const owner = await client.query(
      `SELECT u.id, u.email FROM hotel_staff hs JOIN users u ON u.id = hs.user_id
        WHERE hs.hotel_id = $1 AND hs.permission_level = 'owner' LIMIT 1`,
      [hotel.id]
    );

    let loginEmail;
    if (owner.rows[0]) {
      await client.query(
        `UPDATE users SET password_hash = $1, pin_hash = NULL, pin_failed_attempts = 0,
                pin_locked_until = NULL, account_status = 'active', updated_at = now()
          WHERE id = $2`,
        [passwordHash, owner.rows[0].id]
      );
      await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [owner.rows[0].id]);
      loginEmail = owner.rows[0].email;
      console.log(`Reset the existing owner login for ${hotel.name}.`);
    } else {
      // Unique placeholder phone (users.phone_number is required and unique).
      const phone = "2547" + String(Math.floor(10000000 + Math.random() * 89999999));
      const user = await client.query(
        `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
         VALUES ($1, $2, $3, 'hotel_owner', 'password', false, 'active') RETURNING id`,
        [email.trim().toLowerCase(), phone, passwordHash]
      );
      await client.query(
        "INSERT INTO hotel_staff (user_id, hotel_id, full_name, permission_level) VALUES ($1, $2, $3, 'owner')",
        [user.rows[0].id, hotel.id, `${hotel.name} Owner`]
      );
      loginEmail = email.trim().toLowerCase();
      console.log(`Created an owner login for ${hotel.name}.`);
    }
    await client.query("COMMIT");
    console.log(`\n  Email:    ${loginEmail}\n  Password: (the one you just typed)\n  PIN:      you'll be asked to create one at first sign-in\n`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
