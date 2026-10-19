/**
 * READ-ONLY financial-integrity audit (findings C1, H1, M1). It never
 * writes to the database and never prints names, emails, phone numbers
 * or payment destinations — only internal ids and amounts, which an
 * operator can look up in the admin dashboard.
 *
 *   DATABASE_URL=... node scripts/auditUnpaidBudgets.js            # summary
 *   DATABASE_URL=... node scripts/auditUnpaidBudgets.js --details  # + row ids
 *
 * Reports, for a human remediation decision (nothing is changed here):
 *   1. budgets with no funding transaction (created before migration 043,
 *      possibly through the unfunded POST /api/student/budget route), and
 *      whether ANY successful budget_topup exists for that student;
 *   2. budgets whose total exceeds what the student's successful payments
 *      (top-ups + boosts) can explain;
 *   3. users with more than one ACTIVE budget;
 *   4. successful payments never credited (activated_at IS NULL) and
 *      payments flagged needs_review;
 *   5. pre-047 REJECTED withdrawals whose amount was never restored;
 *   6. hotel payouts in 'unknown' / 'review' state.
 * Exit code is 0 even when findings exist (it's a report, not a gate).
 */
require("dotenv").config();
const { Client } = require("pg");

const details = process.argv.includes("--details");

async function section(client, title, sql) {
  try {
    const res = await client.query(sql);
    console.log(`\n## ${title}: ${res.rows.length}`);
    if (details) for (const row of res.rows) console.log("  ", JSON.stringify(row));
    return res.rows.length;
  } catch (err) {
    console.log(`\n## ${title}: SKIPPED (${err.message})`);
    return 0;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const hasFundingCol = (
      await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name='budgets' AND column_name='funding_transaction_id'"
      )
    ).rows.length > 0;

    console.log("MEALVEST financial-integrity audit (read-only)");
    let total = 0;

    if (hasFundingCol) {
      total += await section(
        client,
        "1. Budgets without a funding transaction (legacy / possibly unpaid)",
        `SELECT b.id AS budget_id, b.user_id, b.status, b.total_amount, b.remaining_amount, b.created_at,
                EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = b.user_id AND t.type = 'budget_topup' AND t.status = 'success') AS student_has_any_paid_topup
           FROM budgets b WHERE b.funding_transaction_id IS NULL ORDER BY b.created_at`
      );
    } else {
      console.log("\n(migration 043 not applied yet — section 1 uses the 'no paid top-up at all' heuristic)");
      total += await section(
        client,
        "1. Budgets for students with NO successful budget_topup at all",
        `SELECT b.id AS budget_id, b.user_id, b.status, b.total_amount, b.remaining_amount, b.created_at
           FROM budgets b
          WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = b.user_id AND t.type = 'budget_topup' AND t.status = 'success')
          ORDER BY b.created_at`
      );
    }

    total += await section(
      client,
      "2. Students whose budget totals exceed their successful payments",
      `WITH paid AS (
         SELECT user_id, SUM(amount) AS paid FROM transactions
          WHERE status = 'success' AND type IN ('budget_topup', 'plan_boost') GROUP BY user_id),
       granted AS (SELECT user_id, SUM(total_amount) AS granted FROM budgets GROUP BY user_id)
       SELECT g.user_id, g.granted, COALESCE(p.paid, 0) AS paid, g.granted - COALESCE(p.paid, 0) AS unexplained
         FROM granted g LEFT JOIN paid p ON p.user_id = g.user_id
        WHERE g.granted > COALESCE(p.paid, 0) ORDER BY unexplained DESC`
    );

    total += await section(
      client,
      "3. Users with more than one ACTIVE budget (blocks migration 043)",
      `SELECT user_id, COUNT(*) AS active_budgets FROM budgets WHERE status = 'active' GROUP BY user_id HAVING COUNT(*) > 1`
    );

    const hasActivated = (
      await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='activated_at'")
    ).rows.length > 0;
    if (hasActivated) {
      total += await section(
        client,
        "4a. Successful payments never credited (activated_at IS NULL)",
        `SELECT id AS transaction_id, user_id, type, amount, provider, provider_reference, activation_attempts, activation_error, updated_at
           FROM transactions WHERE status = 'success' AND activated_at IS NULL ORDER BY updated_at`
      );
      total += await section(
        client,
        "4b. Payments flagged needs_review",
        `SELECT id AS transaction_id, user_id, type, status, amount, provider_reference, activation_error, updated_at
           FROM transactions WHERE needs_review ORDER BY updated_at`
      );
    }
    total += await section(
      client,
      "4c. Successful budget_topup payments not linked to any budget (pre-045 rows: check each manually)",
      `SELECT t.id AS transaction_id, t.user_id, t.amount, t.provider_reference, t.updated_at
         FROM transactions t
        WHERE t.type = 'budget_topup' AND t.status = 'success' AND t.budget_id IS NULL
          ${hasFundingCol ? "AND NOT EXISTS (SELECT 1 FROM budgets b WHERE b.funding_transaction_id = t.id)" : ""}
        ORDER BY t.updated_at`
    );

    const hasRestored = (
      await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='savings_withdrawals' AND column_name='restored_at'")
    ).rows.length > 0;
    total += await section(
      client,
      "5. Rejected withdrawals whose money was never restored",
      `SELECT id AS withdrawal_id, user_id, budget_id, gross_savings, processed_at
         FROM savings_withdrawals WHERE status = 'rejected' ${hasRestored ? "AND restored_at IS NULL" : ""} ORDER BY processed_at`
    );

    total += await section(
      client,
      "6. Hotel payouts awaiting reconciliation or review",
      `SELECT id AS payout_id, hotel_id, amount, status, transfer_reference, failure_reason, created_at
         FROM hotel_payouts WHERE status IN ('unknown', 'review', 'approved', 'pending') ORDER BY created_at`
    );

    await client.query("ROLLBACK");
    console.log(`\n${total} item(s) need human review.${details ? "" : " Re-run with --details for row ids."}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("audit failed:", err.message);
  process.exit(2);
});
