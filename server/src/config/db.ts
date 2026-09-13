import { Pool } from "pg";
import { env } from "./env";

/**
 * Single shared connection pool for the whole process. Using plain
 * `pg` rather than an ORM (Prisma/Drizzle) for Day 1: the schema is
 * still small and every table is money-adjacent eventually, so
 * hand-written SQL keeps every query's exact behavior visible and
 * reviewable rather than generated. Trade-off: more boilerplate per
 * query, no auto-generated types — worth revisiting once the schema
 * stabilizes past the pilot, at which point Drizzle (lighter, closer
 * to raw SQL than Prisma) would be the natural next step without
 * throwing away these migration files.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // Errors on idle clients (e.g. connection dropped) — log, don't crash.
  console.error("Unexpected PostgreSQL pool error", err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
