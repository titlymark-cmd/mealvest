/**
 * Seeds a University Ambassador and default department team members for a university.
 *
 * Usage:
 *   node scripts/seedAmbassador.js "Ambassador Name" ambassador@mealvest.app 0712345679 "password123" "Maseno University"
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
  const [fullName, email, phoneRaw, password, universityName] = process.argv.slice(2);
  const targetUni = universityName || "Maseno University";

  if (!fullName || !email || !phoneRaw || !password) {
    console.error("Usage: node scripts/seedAmbassador.js \"Full Name\" email@example.com 0712345679 password \"University Name\"");
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
    const uniRes = await client.query("SELECT id, name FROM universities WHERE name ILIKE $1 LIMIT 1", [`%${targetUni}%`]);
    if (uniRes.rows.length === 0) {
      console.error(`University "${targetUni}" not found. Run migrations first.`);
      process.exit(1);
    }
    const university = uniRes.rows[0];

    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = await bcrypt.hash("1234", 12); // default demo PIN

    await client.query("BEGIN");

    // 1. Create or get user
    const existingUser = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    let userId;
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      await client.query("UPDATE users SET role = 'university_ambassador', password_hash = $1, pin_hash = $2 WHERE id = $3", [
        passwordHash,
        pinHash,
        userId,
      ]);
    } else {
      const userRes = await client.query(
        `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, email_verified, account_status)
         VALUES ($1, $2, $3, $4, 'university_ambassador', 'password', true, 'active')
         RETURNING id`,
        [email.toLowerCase(), phoneNumber, passwordHash, pinHash]
      );
      userId = userRes.rows[0].id;
    }

    // 2. Insert or update ambassador profile
    const ambRes = await client.query(
      `INSERT INTO university_ambassadors (user_id, full_name, phone_number, email, bio)
       VALUES ($1, $2, $3, $4, 'University Ambassador leading campus growth and operations.')
       ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [userId, fullName, phoneNumber, email.toLowerCase()]
    );
    const ambassadorId = ambRes.rows[0].id;

    // 3. Assign to university
    await client.query(
      `INSERT INTO ambassador_assignments (ambassador_id, university_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT DO NOTHING`,
      [ambassadorId, university.id]
    );

    // 4. Create sample department leads if not present
    const departments = [
      { dept: "marketing", name: "Faith Chebet", title: "Digital Marketing Lead", email: `marketing.${university.name.toLowerCase().replace(/[^a-z]/g, "")}@mealvest.app` },
      { dept: "hotels", name: "Kevin Omondi", title: "Hotel Partnerships Lead", email: `hotels.${university.name.toLowerCase().replace(/[^a-z]/g, "")}@mealvest.app` },
      { dept: "customer_care", name: "Mercy Wanjiku", title: "Customer Care Lead", email: `support.${university.name.toLowerCase().replace(/[^a-z]/g, "")}@mealvest.app` },
    ];

    for (const d of departments) {
      await client.query(
        `INSERT INTO team_members (university_id, department, full_name, email, role_title, status, performance_score)
         VALUES ($1, $2, $3, $4, $5, 'active', 90.0)
         ON CONFLICT DO NOTHING`,
        [university.id, d.dept, d.name, d.email, d.title]
      );
    }

    await client.query("COMMIT");
    console.log(`✓ Ambassador account created for ${university.name}: ${email} (PIN: 1234)`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to seed ambassador:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
