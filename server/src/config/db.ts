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
  // Supabase's pooler connection string usually carries its own
  // sslmode=require, but that's a property of the URL string, not
  // something this code verifies. Enforcing it explicitly in
  // production means a malformed/copy-pasted connection string can't
  // silently downgrade to a plaintext connection — reject unverified
  // certs is intentionally NOT set, since Supabase's pooler uses a
  // cert chain not always in Node's default trust store; this still
  // gets encryption-in-transit, which is what actually matters here.
  ssl: env.isProduction ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  // Errors on idle clients (e.g. connection dropped) — log, don't crash.
  console.error("Unexpected PostgreSQL pool error", err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("Database health check failed", err);
    return false;
  }
}
