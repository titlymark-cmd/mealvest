export type DailyCreditStatus = "unused" | "partial" | "low";

/**
 * Three-tier status for the daily-credit ring, based on what's left
 * of today's total spendable amount (daily allowance + any rolled-over
 * balance) — not the plan's overall remaining balance, since "today"
 * is what the ring visualizes.
 *   - "unused": nothing spent yet today (or nothing to spend at all)
 *   - "low": less than a quarter of today's total is still available
 *   - "partial": some spent, but at least a quarter remains
 */
export function getDailyCreditStatus(spentToday: number, totalAvailableToday: number): DailyCreditStatus {
  if (spentToday <= 0) return "unused";
  if (totalAvailableToday <= 0) return "low";
  const remainingFraction = Math.max(0, totalAvailableToday - spentToday) / totalAvailableToday;
  if (remainingFraction < 0.25) return "low";
  return "partial";
}
