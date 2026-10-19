-- 044 — Row Level Security, deny-by-default (finding H6)
--
-- ARCHITECTURE (verified in the code before writing this):
--   * The Node backend reaches Postgres ONLY through `pg` with
--     DATABASE_URL (Supabase pooler, `postgres` role). That role owns
--     these tables and has BYPASSRLS on Supabase, so RLS does not affect
--     any backend query. Authorization for the app is enforced in the
--     backend (requireAuth/requireRole + ownership checks in SQL).
--   * The app never uses PostgREST, the Supabase JS SDK or Supabase
--     Auth. auth.uid() would never map to a MEALVEST user, so
--     ownership-based policies would be meaningless.
--   * BUT Supabase exposes the `public` schema through PostgREST to the
--     `anon` and `authenticated` roles, and by default grants them table
--     privileges. The anon key is public by design. Without RLS, anyone
--     holding it could read e.g. users.password_hash, refresh/reset
--     token hashes, transactions and payouts.
--
-- So: enable RLS on EVERY table in `public` with NO permissive policies
-- (deny-all for anon/authenticated), and revoke their privileges as a
-- second layer. Tables created by later migrations enable RLS
-- themselves; scripts/checkRls.js verifies nothing was missed.
--
-- On a plain (non-Supabase) Postgres, the anon/authenticated roles don't
-- exist; the role-specific statements are skipped.
--
-- Rollback: `ALTER TABLE <t> DISABLE ROW LEVEL SECURITY` per table — but
-- only after confirming PostgREST access is otherwise blocked.

DO $$
DECLARE
  t RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    IF has_anon THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.relname);
    END IF;
    IF has_auth THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t.relname);
    END IF;
  END LOOP;

  IF has_anon THEN
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
  END IF;
  IF has_auth THEN
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated';
  END IF;
END $$;
