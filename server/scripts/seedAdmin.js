/**
 * Creates a mealvest_admin account directly against the database.
 * There is no API endpoint for this on purpose — the spec requires
 * admin accounts to be unreachable via self-registration.
 *
 * Usage:
 *   node scripts/seedAdmin.js "Admin Name" admin@mealvest.app 0712345678 "a-strong-password"
 */
require("dotenv").config();
const { Client } = require("pg");
const bcrypt = require("bcrypt");

function normalizePhone(raw) {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^0[71]\d{8}$/.test(digits)) return "254" + digits.slice(1);
  if (/^254[71]\d{8}$/.test(digits)) return digits;
  if (/^[71]\d{8}$/.test(digits)) return "254" + digits;
  return null;
}

async function main() {
  const [fullName, email, phoneRaw, password] = process.argv.slice(2);
  if (!fullName || !email || !phoneRaw || !password) {
    console.error("Usage: node scripts/seedAdmin.js \"Full Name\" email@example.com 0712345678 password");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const phoneNumber = normalizePhone(phoneRaw);
  if (!phoneNumber) {
    console.error("Invalid phone number.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (email, phone_number, password_hash, role, auth_provider, email_verified, account_status)
       VALUES ($1, $2, $3, 'mealvest_admin', 'password', true, 'active')
       RETURNING id`,
      [email.toLowerCase(), phoneNumber, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query("INSERT INTO admins (user_id, full_name) VALUES ($1, $2)", [userId, fullName]);
    await client.query("COMMIT");

    console.log(`✓ Admin account created: ${email} (user_id: ${userId})`);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      console.error("An account with this email or phone number already exists.");
    } else {
      console.error("Failed to create admin:", err.message);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
