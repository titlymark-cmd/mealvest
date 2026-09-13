/**
 * Minimal, dependency-light migration runner.
 *
 * Usage:
 *   node scripts/migrate.js
 *
 * Reads every .sql file in /migrations in filename order, and for
 * any file not already recorded in `schema_migrations`, runs it
 * inside a transaction and records it. Safe to run repeatedly —
 * already-applied migrations are skipped.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ranCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip   ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply  ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ranCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log(ranCount === 0 ? "Database already up to date." : `Applied ${ranCount} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
