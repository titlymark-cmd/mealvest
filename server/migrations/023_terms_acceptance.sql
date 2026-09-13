-- 023: student payment terms acceptance
--
-- The disclaimer ("committed funds are for meals during this
-- period, not immediately withdrawable, unused daily balance carries
-- forward per Mealvest's rules") must be shown BEFORE a budget is
-- created and funds are committed. Recording acceptance on the
-- budget row itself — not just a generic "user accepted terms once"
-- flag — means each new plan/commitment gets its own explicit
-- acceptance, matching a real plan-by-plan disclaimer rather than a
-- one-time account-level checkbox that goes stale.
ALTER TABLE budgets
  ADD COLUMN terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN terms_version     TEXT;

-- NOT NULL would break re-running old migrations against existing
-- data, so this is enforced at the application layer instead (see
-- budgetService.createBudget) — every NEW budget requires it, but
-- the column itself stays nullable for schema-migration safety.
