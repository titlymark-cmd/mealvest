# Daily hotel payouts — operations notes

## Payout policy

- Hotels are paid once per day at their configured wall-clock time in the business timezone (`Africa/Nairobi` by default).
- The minimum accumulated net balance is KSh 40 (or the active provider's higher minimum). A balance below the minimum remains unpaid and carries forward.
- New redeemed orders use a fixed 10% MEALVEST payout fee, calculated per order in integer cents. Provider transfer fees are separate.
- Payout records expose gross, fee, and net amounts. Migration 052 preserves existing order and payout amounts; it does not recalculate historical settlements. Existing redeemed orders retain their previously frozen fee/net split.
- Hotel administrators can edit the daily payout time, but cannot select another schedule or change the fee.

## Scheduled run

`GET /api/cron/daily-payouts` must be invoked every 10 minutes with
`Authorization: Bearer $CRON_SECRET`. `vercel.json` configures this cadence;
Vercel requires a plan that supports sub-daily Cron Jobs (Pro or higher).
Otherwise, use an external scheduler at the same cadence and provide the
bearer header. A once-daily schedule is insufficient: payout initiation can
be delayed by up to the scheduler interval.

Each invocation considers hotels whose configured time has passed and that
have not completed their daily evaluation. `hotel_daily_payout_runs`
provides a per-hotel/per-business-day claim and bounded retry behavior.
`AUTO_PAYOUTS_ENABLED` must be exactly `true`; it defaults to off. The cron
endpoint also requires `CRON_SECRET` and refuses unauthenticated requests.

## Settlement safety

The scheduler uses the existing payout claim and transfer lifecycle. In one
transaction, the hotel row is locked, eligible redeemed orders are claimed
once, and a payout row records the gross/fee/net breakdown. A provider
idempotency reference and existing reconciliation protect uncertain sends.
Open or unresolved payouts are not resent. Confirmed failures release their
orders; automatic retries respect the configured cooldown and consecutive
failure limit. Administrators may retry only a confirmed failed payout.
Over-limit payouts continue through the existing review/approval controls.

Useful monitoring:

- Admin **Hotel Payouts** shows unpaid balances, payout breakdowns, status,
  failure reason, and stale processing alerts.
- `hotel_daily_payout_runs` records each evaluation and outcome.
- A `processing` payout requires its provider's confirmation/webhook. A
  missed webhook leaves it visible for follow-up; it is not assumed paid.

## Configuration and deployment

Set `CRON_SECRET` in Vercel and ensure the scheduler sends the matching bearer
token. Keep `AUTO_PAYOUTS_ENABLED=false` until the active payout provider,
its webhook, and reconciliation have been verified in a non-production test.
Then explicitly set it to `true` to enable scheduled hotel payouts.

See `.env.example` for `AUTO_PAYOUT_THRESHOLD_KES` (default 40),
`AUTO_PAYOUT_MAX_CONSECUTIVE_FAILURES` (default 3),
`AUTO_PAYOUT_FAILURE_COOLDOWN_MINUTES` (default 60), and
`PAYOUT_STALE_PROCESSING_MINUTES` (default 120). These settings do not alter
the 10% payout fee.
