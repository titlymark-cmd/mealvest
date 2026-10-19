import fs from "fs";
import { Pool, PoolConfig } from "pg";
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
/**
 * Database TLS (finding L1).
 *
 * Verified facts (pg 8.23 / pg-connection-string 2.14): an `sslmode` in
 * DATABASE_URL OVERRIDES the `ssl` option passed in code, and
 * sslmode=require is currently treated as verify-full against Node's
 * default CA store. The previous code's `rejectUnauthorized: false`
 * therefore only applied when the URL had no sslmode.
 *
 * Resolution order (never weaker than before):
 *  1. DATABASE_CA_CERT (PEM text; "\n" escapes allowed) or
 *     DATABASE_CA_CERT_PATH is set -> full verification (chain + hostname)
 *     against that CA. Any sslmode in the URL is removed so this wins.
 *     Use the CA certificate downloaded from YOUR Supabase project
 *     (Dashboard -> Project Settings -> Database -> SSL configuration);
 *     see DEPLOYMENT.md for verification/rotation.
 *  2. The URL carries sslmode -> left to pg (verify-full, system CAs).
 *  3. Production without either -> encrypted but UNVERIFIED (previous
 *     behaviour) with a loud warning — or a boot failure when
 *     DATABASE_TLS_REQUIRE_VERIFIED=true.
 *  4. Development/test -> whatever the URL says (usually no TLS locally).
 */
export function resolveDatabaseConfig(databaseUrl: string, isProduction: boolean): Pick<PoolConfig, "connectionString" | "ssl"> {
  const pemInline = (process.env.DATABASE_CA_CERT || "").replace(/\\n/g, "\n").trim();
  const pemPath = (process.env.DATABASE_CA_CERT_PATH || "").trim();
  const ca = pemInline || (pemPath ? fs.readFileSync(pemPath, "utf8") : "");

  if (ca) {
    if (!ca.includes("BEGIN CERTIFICATE")) {
      throw new Error("DATABASE_CA_CERT / DATABASE_CA_CERT_PATH does not contain a PEM certificate.");
    }
    const url = new URL(databaseUrl);
    for (const k of ["sslmode", "ssl", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(k);
    return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
  }

  const hasSslMode = /[?&]sslmode=/i.test(databaseUrl);
  if (hasSslMode) return { connectionString: databaseUrl };

  if (isProduction) {
    if (process.env.DATABASE_TLS_REQUIRE_VERIFIED === "true") {
      throw new Error("DATABASE_TLS_REQUIRE_VERIFIED=true but no DATABASE_CA_CERT / DATABASE_CA_CERT_PATH is configured.");
    }
    console.warn(
      "[db] WARNING: database TLS certificate is NOT verified (no DATABASE_CA_CERT configured). " +
        "Traffic is encrypted but a network attacker could impersonate the database. See DEPLOYMENT.md."
    );
    return { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } };
  }
  return { connectionString: databaseUrl };
}

export const pool = new Pool({
  ...resolveDatabaseConfig(env.databaseUrl, env.isProduction),
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
  } catch (err) {
    console.error("Database health check failed", err);
    return false;
  }
}
