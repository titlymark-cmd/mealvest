-- Fix incorrect daily_allowance values that were previously recomputed
-- from remaining_amount / remaining days (causing double-counting of
-- today's spend in the displayed daily credit).
--
-- Daily allowance is now permanently the original plan allocation:
-- total_amount / number_of_days (rounded to 2 decimals).
-- This migration reconciles existing active budgets without touching
-- any transaction history.

UPDATE budgets
SET daily_allowance = ROUND(total_amount / GREATEST(number_of_days, 1), 2),
    updated_at = now()
WHERE status = 'active'
  AND ABS(daily_allowance - ROUND(total_amount / GREATEST(number_of_days, 1), 2)) > 0.01;

-- Also correct any completed/suspended plans for consistency, but only
-- if the stored value is clearly the "remaining/days" style error.
UPDATE budgets
SET daily_allowance = ROUND(total_amount / GREATEST(number_of_days, 1), 2),
    updated_at = now()
WHERE status IN ('completed', 'suspended', 'cancelled')
  AND ABS(daily_allowance - ROUND(total_amount / GREATEST(number_of_days, 1), 2)) > 0.01;
