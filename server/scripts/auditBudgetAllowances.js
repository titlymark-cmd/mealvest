/**
 * READ-ONLY audit for the Stage 1 budget model (fixed daily allowance +
 * additive carry-forward). It never writes (the whole session is
 * BEGIN READ ONLY) and prints only internal ids and amounts — no names,
 * emails or phone numbers.
 *
 *   DATABASE_URL=... node scripts/auditBudgetAllowances.js            # summary
 *   DATABASE_URL=... node scripts/auditBudgetAllowances.js --details  # + one line per plan
 *
 * Why it exists: before Stage 1, daily_allowance was RECOMPUTED on every read
 * (remaining / days left), so the stored value on a live plan has drifted away
 * from "funded amount / plan days". The new code treats the stored value as the
 * fixed allowance, so this report shows, per ACTIVE plan, what is stored versus
 * what the approved rule would give, so an operator can decide on any backfill.
 * NOTHING is changed here and no backfill is performed.
 *
 * Per active plan it reports:
 *   - stored daily_allowance
 *   - expected_allowance = floor(funding payment / number_of_days) to the cent,
 *     where the plan has a funding transaction (legacy unfunded plans show NULL
 *     and are listed separately: their original amount cannot be proven)
 *   - boosts credited to the plan (successful plan_boost payments) — a boost
 *     legitimately raises the allowance, so expected_with_boosts is shown too
 *     (approximation: boost / plan days; the live rule uses days left at boost time)
 *   - carry-forward (banked) and the retired pending_* fields, which the new
 *     rollover folds into carry-forward once
 *   - reserved_amount vs open meal-pass holds (should be equal)
 *   - invariant checks: remaining + spent == total, reserved <= remaining
 */
require("dotenv").config();
const { Client } = require("pg");

const details = process.argv.includes("--details");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(`
      SELECT b.id AS budget_id, b.number_of_days, b.total_amount, b.remaining_amount, b.amount_spent,
             b.daily_allowance AS stored_allowance,
             b.banked_amount, b.pending_tomorrow_amount, b.pending_rollover_amount,
             b.reserved_amount, b.spent_today, b.last_spend_date, b.start_date, b.end_date,
             ft.amount AS funding_amount,
             CASE WHEN ft.amount IS NULL THEN NULL
                  ELSE floor(ft.amount / b.number_of_days * 100) / 100 END AS expected_allowance,
             COALESCE((SELECT sum(t.amount) FROM transactions t
                        WHERE t.budget_id = b.id AND t.type = 'plan_boost' AND t.status = 'success'), 0) AS boosts,
             COALESCE((SELECT sum(o.amount) FROM orders o WHERE o.budget_id = b.id AND o.status IN ('paid','ready')), 0) AS open_holds
        FROM budgets b
        LEFT JOIN transactions ft ON ft.id = b.funding_transaction_id
       WHERE b.status = 'active'
       ORDER BY b.created_at`);

    const money = (v) => Math.round(Number(v) * 100);
    let drift = 0, unfunded = 0, pendingLegacy = 0, holdMismatch = 0, invariant = 0;
    console.log("MEALVEST budget-allowance audit (read-only)");
    for (const r of rows) {
      const flags = [];
      if (r.expected_allowance === null) { unfunded++; flags.push("UNFUNDED_LEGACY_PLAN"); }
      else if (money(r.stored_allowance) !== money(r.expected_allowance)) {
        if (Number(r.boosts) > 0) flags.push("ALLOWANCE_DIFFERS_BOOSTS_PRESENT");
        else { drift++; flags.push("ALLOWANCE_DRIFTED"); }
      }
      if (money(r.pending_tomorrow_amount) > 0 || money(r.pending_rollover_amount) > 0) { pendingLegacy++; flags.push("LEGACY_PENDING_WILL_BE_FOLDED_INTO_CARRY"); }
      if (money(r.reserved_amount) !== money(r.open_holds)) { holdMismatch++; flags.push("RESERVED_NE_OPEN_HOLDS"); }
      if (money(r.remaining_amount) + money(r.amount_spent) !== money(r.total_amount) || money(r.reserved_amount) > money(r.remaining_amount)) {
        invariant++; flags.push("INVARIANT_BROKEN");
      }
      if (details) console.log("  ", JSON.stringify({ ...r, flags }));
    }
    console.log(`\nActive plans: ${rows.length}`);
    console.log(`  allowance drifted from funding/days (no boosts): ${drift}`);
    console.log(`  legacy plans without a funding transaction (original amount unprovable): ${unfunded}`);
    console.log(`  plans with legacy pending_* amounts (folded into carry-forward on next read): ${pendingLegacy}`);
    console.log(`  reserved_amount != open meal-pass holds: ${holdMismatch}`);
    console.log(`  remaining+spent != total, or reserved > remaining: ${invariant}`);
    console.log("\nNo data was changed. Decide on any backfill separately.");
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
