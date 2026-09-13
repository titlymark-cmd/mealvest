-- 026: manual "transfer remaining to next day"
--
-- banked_amount (migration 025) is immediately spendable — it's
-- added straight into today's available total. That's correct for
-- AUTOMATIC end-of-day rollover, but wrong for a student manually
-- choosing "move this to tomorrow" mid-day: the whole point of that
-- action is the money stops being available TODAY. Reusing
-- banked_amount for this would make the button a no-op (the money
-- would still show as spendable immediately).
--
-- pending_tomorrow_amount is a separate holding pool: money placed
-- here is NOT counted in today's spendable total, and only merges
-- into banked_amount (becoming spendable) when a real day actually
-- passes — see budgetService.applyDailyRollover, updated to merge
-- this in alongside its existing carry-forward logic.
ALTER TABLE budgets
  ADD COLUMN pending_tomorrow_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (pending_tomorrow_amount >= 0);
