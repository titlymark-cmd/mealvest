-- 033: pending_rollover_amount — unused daily balance from a past day
-- no longer auto-credits to banked_amount when a new day starts; it
-- now waits here for the student's explicit confirm or decline (see
-- POST /student/budget/rollover/confirm|decline). Accumulates across
-- multiple undecided day-crossings so a student who skips several
-- days in a row sees one combined prompt for everything still
-- undecided, rather than one per missed day.
ALTER TABLE budgets ADD COLUMN pending_rollover_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
