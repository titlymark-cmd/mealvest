# Automated hotel payouts (KSh 40 threshold) — operations notes

## How it works
1. A hotel scans a student's QR -> `orderService.redeemOrderByQr` (unchanged logic) commits the redemption, freezing `orders.hotel_amount`.
2. After the commit, `hotelPayoutService.evaluateAutoPayout(hotelId)` runs in the background (`runInBackground`, which uses Vercel `waitUntil`). The scan response never waits on it.
3. Payable balance = `SUM(orders.hotel_amount)` where `redeemed = true AND payout_id IS NULL` (the existing authoritative model; no new accounting tables).
4. Inside `claimPendingOrdersForPayout` (one transaction, hotel row locked `FOR UPDATE`): if balance `>= threshold` every unclaimed order is attached to ONE new `hotel_payouts` row (`payout_id`), otherwise nothing happens and the earnings stay payable.
5. The payout is sent via the existing `submitPayout` path (pending -> unknown -> processing/successful/failed), with `transfer_reference` as the provider Idempotency-Key.
6. Automatic payouts have `initiated_by_admin_id IS NULL` (API field `automated: true`).

Examples: 35 + 10 -> pays 45. 15 + 12 = 27 -> nothing, 27 kept; +18 -> pays 45 (all three orders). Exactly 40 -> pays 40. 39.99 -> nothing.

## Safety rules enforced
- A hotel with a payout in `pending`/`review`/`approved`/`unknown` gets no new automatic payout (uncertain outcomes are reconciled first). `processing` does not block: its funds are already reserved, new earnings are distinct.
- Definitive failure releases orders (existing behaviour). Automatic retry is capped: 60 min cooldown, and after 3 consecutive failures automatic attempts stop until an admin triggers manually.
- Over-limit payouts still go to `review` (existing dual-approval rule); an automatic payout has no initiator so any admin may approve.
- Stale `pending` payouts (process died after claim, before any provider call) are sent by the reconcile cron; a sweep also pays hotels already >= threshold that no trigger paid.

## Database
No migration required. Everything reuses migration 038/046/049 columns and constraints.

## Environment (see .env.example)
`AUTO_PAYOUTS_ENABLED` (default off), `AUTO_PAYOUT_THRESHOLD_KES` (40), `AUTO_PAYOUT_MAX_CONSECUTIVE_FAILURES` (3), `AUTO_PAYOUT_FAILURE_COOLDOWN_MINUTES` (60), `PAYOUT_STALE_PROCESSING_MINUTES` (120).

## Safe deployment sequence
1. Deploy the code with `AUTO_PAYOUTS_ENABLED` unset/false (nothing changes except: manual payout now refuses balances < KSh 40, and admin payout lists gain fields).
2. In the Cyzora dashboard confirm the webhook URL `https://<api>/api/webhooks/cyzora`, that it is subscribed to the payout events, and that `CYZORA_WEBHOOK_SECRET` matches. Check key mode (sk_test vs sk_live) matches the webhook mode.
3. With a Cyzora SANDBOX key, do one test payout and confirm it reaches `successful` (see "Unverified" below). Capture the real webhook body.
4. Confirm `/api/cron/reconcile` is actually scheduled (Vercel Hobby = daily at most) and `CRON_SECRET` is set.
5. Set `AUTO_PAYOUTS_ENABLED=true`.

## Unverified / limitations (read before enabling)
- Cyzora's official docs could not be retrieved in this environment. The event names `payout.paid`/`payout.failed`, the `status` vocabulary, the payload shape, and "Idempotency-Key replay returns the original payout" come from the existing integration, which its own README says was built from an integration brief and not fully confirmed. Nothing was invented or changed there.
- No documented per-payout read endpoint is used. A `processing` Cyzora payout is finalised ONLY by a signed webhook. If a webhook is missed, the payout stays `processing`; it is now flagged `needs_attention` after `PAYOUT_STALE_PROCESSING_MINUTES` and unrecognised payout events are logged at error level, but it is not auto-resolved.
- The dashboard frontend was not supplied; no frontend change was made.

---

# Payout modes: Instant and Daily (migration 051)

Every hotel has a persistent `payout_mode` (`instant` | `daily`) and, for daily, a `payout_time` (wall clock, `HH:MM`, interpreted in `BUSINESS_TIMEZONE`, default `Africa/Nairobi`, UTC+3 with no DST). The backend is authoritative; the mode is re-checked under the hotel row lock at the moment funds are reserved.

| | Instant | Daily |
|---|---|---|
| Trigger | after each QR redemption (unchanged) + the reconcile sweep | the scheduled run at the hotel's time only |
| Threshold | KSh 40, full unpaid balance | KSh 40, full unpaid balance, evaluated once per day |
| Below threshold | accumulates | accumulates and carries to the next scheduled evaluation; the hotel stays Daily |
| Default commission | 15% | 10% |

Commission: `commission_override_percent` (NULL = none). Effective rate = override, else the default for the mode (`src/lib/hotelCommission.ts`, the only place the defaults live). Applied once at redemption and frozen on the order; changing a rate or mode never touches past orders. Overrides are 0-30% (DB CHECK + API validation), settable only by admins (`PATCH /api/admin/hotels/:id/commission`; `null` clears). Mode/time changes are admin-only (`PATCH /api/admin/hotels/:id/payout-settings`) and never change an override. The legacy `hotels.commission_percent` column is no longer read.

Existing hotels: migration sets `payout_mode='instant'` and copies each hotel's current `commission_percent` into `commission_override_percent`, so nobody's rate changes silently. To move a hotel to the new 15% default, clear its override from the admin screen (blank commission).

## Daily scheduler (REQUIRED external trigger)

`GET /api/cron/daily-payouts` with `Authorization: Bearer $CRON_SECRET`. Each call evaluates the daily hotels whose time has passed today and have not been settled today (`hotel_daily_payout_runs`, one row per hotel per Nairobi day). **It must be invoked every 5-15 minutes.** The app runs on Vercel serverless: nothing in the process can fire it, and Vercel Hobby cron is limited to once a day, which is not enough (a hotel at 21:00 would be paid whenever the daily call happens to land). Use Vercel Pro cron (`*/10 * * * *`) or any external scheduler (cron-job.org, GitHub Actions `schedule`, Cloudflare Cron Trigger) calling that URL. Payout lateness = the scheduler interval. The endpoint is idempotent, safe to run concurrently, and gated by `AUTO_PAYOUTS_ENABLED`.

Safety: the date key only limits how often a hotel is re-evaluated. Duplicate payment is prevented by the unchanged mechanisms: order claim under the hotel row lock (`orders.payout_id`), one-unsent-payout-per-hotel index, per-payout reference/Idempotency-Key, and reconciliation of `unknown` outcomes. An open/unknown payout makes the hotel `skipped` (retried every 15 min, max 4 attempts/day), never re-sent. A failed payout releases its orders (existing behaviour) and respects the existing failure cooldown / 3-failure cap; a daily hotel never falls back to instant payout. Orders redeemed after a reservation are not part of it.

Monitoring: failed/unknown payouts appear in the admin payouts list (`needs_attention`); each scheduled evaluation is recorded in `hotel_daily_payout_runs` (status `initiated | below_threshold | nothing | skipped | error`, with detail). A run that exhausts its attempts logs `[dailyPayoutService] ... needs attention`.
