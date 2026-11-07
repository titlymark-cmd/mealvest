-- 056: Row Level Security for the voting tables (finding H6 follow-up).
--
-- hotel_votes and vote_otps were added in migration 052, AFTER 044 enabled
-- RLS on every then-existing table, and 052 did not enable it on the new
-- tables. On Supabase that would leave them reachable via PostgREST with the
-- public anon key — and they hold voter phone numbers, emails and OTP codes.
-- This closes that gap, mirroring the deny-by-default pattern of 044/048.
-- scripts/checkRls.js verifies the result.

ALTER TABLE hotel_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_otps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON hotel_votes FROM anon';
    EXECUTE 'REVOKE ALL ON vote_otps FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON hotel_votes FROM authenticated';
    EXECUTE 'REVOKE ALL ON vote_otps FROM authenticated';
  END IF;
END $$;
