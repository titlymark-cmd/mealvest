/**
 * READ-ONLY Row Level Security check (finding H6). Never modifies anything.
 *
 *   DATABASE_URL=... node scripts/checkRls.js
 *
 * Fails (exit 1) when:
 *   - any table in `public` has RLS disabled;
 *   - any policy on a public table grants anon/authenticated/PUBLIC an
 *     unconditional (USING true / no USING) permissive policy.
 * Warns (exit 0) when anon/authenticated still hold table privileges —
 * RLS still blocks them, but 044 revokes these as a second layer.
 *
 * Prints table/role names only; never the connection string or data.
 */
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const problems = [];
  const warnings = [];
  try {
    await client.query("SET TRANSACTION READ ONLY").catch(() => {});

    const noRls = await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity ORDER BY 1`
    );
    for (const r of noRls.rows) problems.push(`RLS disabled on public.${r.relname}`);

    const permissive = await client.query(
      `SELECT tablename, policyname, roles, cmd, qual FROM pg_policies
        WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
          AND (roles && ARRAY['anon','authenticated','public']::name[])
          AND (qual IS NULL OR btrim(qual) IN ('true', '(true)'))`
    );
    for (const p of permissive.rows) {
      problems.push(`Unconditional permissive policy "${p.policyname}" on public.${p.tablename} for ${p.roles} (${p.cmd})`);
    }

    const roles = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
    if (roles.rows.length > 0) {
      const grants = await client.query(
        `SELECT grantee, table_name, string_agg(privilege_type, ',') AS privs
           FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
          GROUP BY grantee, table_name ORDER BY 2, 1`
      );
      for (const g of grants.rows) warnings.push(`${g.grantee} still has [${g.privs}] on public.${g.table_name}`);
    }

    const total = await client.query(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`
    );
    console.log(`Checked ${total.rows[0].n} public tables.`);
  } finally {
    await client.end();
  }

  for (const w of warnings) console.warn(`WARN  ${w}`);
  for (const p of problems) console.error(`FAIL  ${p}`);
  if (problems.length > 0) {
    console.error(`${problems.length} RLS problem(s) found.`);
    process.exit(1);
  }
  console.log("OK — every public table has RLS enabled and no unconditional policy exposes it to anon/authenticated.");
}

main().catch((err) => {
  console.error("checkRls failed:", err.message);
  process.exit(2);
});
