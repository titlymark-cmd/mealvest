# Daily hotel payouts — operations notes

## Payout policy

- Hotels are paid once per day at their configured wall-clock time in the business timezone (`Africa/Nairobi` by default).
- The minimum accumulated net balance is KSh 40 (or the active provider's higher minimum). A balance below the minimum remains unpaid and carries forward.
- New redeemed orders use a fixed 10% MEALVEST payout fee, calculated per order in integer cents. Provider transfer fees are separate.
- Payout records expose gross, fee, and net amounts. Migration 052 preserves existing order and payout amounts; it does not recalculate historical settlements. Existing redeemed orders retain their previously frozen fee/net split.
- Every payout submits the full frozen hotel amount. Cyzora's payout `amount` is the amount received by the destination; its fee is charged separately to the configured API payout wallet. Provider fees never reduce the hotel's amount or block a payout because they exceed Mealvest's commission.
- Only a fee returned by a Cyzora payout response or signed `payout.paid` event is recorded as actual. Fee previews are estimates and are not written to payout accounting. Missing actual fees remain `unknown`, and the admin net and totals indicate when that prevents a complete total.
- Mealvest net for a payout is `payout_fee_amount - provider_fee_amount` and may be negative. `provider_fee_shortfall_amount` records the confirmed fee above Mealvest's commission. Neither value changes the hotel's payout amount.
- Hotel administrators can edit the daily payout time, but cannot select another schedule or change the fee.

## Scheduled run

The real architecture is:

GitHub Actions → `https://<production-domain>/api/cron/daily-payouts` → `CRON_SECRET` bearer auth → `runDailyPayouts()` → the shared payout execution service.

`GET /api/cron/daily-payouts` must be invoked every 10 minutes with
`Authorization: Bearer $CRON_SECRET`. This is intentionally not a Vercel Cron
job: GitHub-hosted cron is used for this daily-payout trigger, while Vercel
remains the app host. A once-daily schedule is insufficient: payout initiation
can be delayed by up to the scheduler interval.

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

Cyzora charges its fee separately from the destination amount, from the wallet
selected by the account's API payout-wallet setting (unless an explicit wallet
is requested). Keep that wallet funded for both the hotel amount and applicable
fees. A clear insufficient-balance refusal becomes a confirmed failure and
releases the orders for an authorized retry. Timeouts and server errors remain
`unknown`; they cannot be retried under a new reference.

Cyzora requires payout amounts in whole Kenyan shillings. Mealvest does not
round fractional hotel entitlements; a fractional amount is refused before
transfer and remains payable for a later safe attempt/provider configuration.

Useful monitoring:

- Admin **Hotel Payouts** shows unpaid balances, payout breakdowns, status,
  failure reason, and stale processing alerts.
- When Cyzora includes a failure reason in its payout response or signed
  webhook, Mealvest preserves it in payout history. Cyzora's published
  `payout.failed` webhook schema does not guarantee a reason; otherwise the
  admin screen says no detail was included.
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
