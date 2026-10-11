# End-to-end payment tests (mock Cyzora)

Runs the **real** Express API against a **disposable local Postgres** and a
**mock Cyzora API**, then drives 70+ scenarios over HTTP: STK push, hosted
checkout, webhooks (good/bad/tampered signatures, duplicates, races, mode
mismatch), amount mismatch, boosts, hotel payouts, authorization,
validation, rate-limit backoff, and Paystack regressions.

It can **never** touch the real Cyzora API or real money:

- `run-e2e.sh` starts the server itself with a fake `sk_test_e2e_key` and
  `CYZORA_BASE_URL` pointing at `mock-cyzora.js` on localhost, after
  unsetting every `CYZORA_*` / `PAYSTACK_*` value from your shell.
- `e2e.js` refuses to run unless the API, the mock and the database are all
  on localhost, the database URL does not mention Supabase, and the server
  reports `testMode: true`.
- The database is **wiped and re-migrated** on every run, so the script also
  refuses any database whose name does not contain `e2e` or `test`.

## Files

| File | Purpose |
|---|---|
| `mock-cyzora.js` | Stand-in for `https://api.cyzora.co.ke/api/v1` built from the integration brief: `POST /charges`, `GET /charges/{id}`, `POST /transactions/initialize`, `GET /transactions/verify/{reference}`, `POST /payouts`, `GET /payouts/fee-preview`, `GET /payout-banks`. Checks `X-API-Key`, `Idempotency-Key`, integer-cent amounts and https redirect URLs; records every request; `POST /__config` steers outcomes (charge status, amount override, 429s, error bodies). |
| `e2e.js` | The scenario driver. Seeds an admin, two students and four hotels, then asserts HTTP responses, database rows and what the mock received. Exit code 0 only if every scenario passed. |
| `run-e2e.sh` | Orchestrates: reset DB → `npm run migrate` → start mock → start server → run `e2e.js` → stop everything. |
| `send-test-webhook.sh` | Deployment probe for a real `/api/webhooks/cyzora` URL. Sends an unsigned, a wrongly signed and a correctly signed `webhook.test`. No payment, no API key. |

## Running

You need a local Postgres you are happy to wipe. Easiest:

```bash
docker run -d --name mealvest-e2e-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker exec mealvest-e2e-pg psql -U postgres -c 'CREATE DATABASE mealvest_e2e;'
```

Then, from `server/` (dependencies installed with `npm install`):

```bash
E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/mealvest_e2e npm run test:e2e
```

Expected tail of the output:

```
70/71 passed        # or 71/71 — see "Known expectations" below
```

Optional knobs: `E2E_API_PORT` (default 4100), `E2E_MOCK_PORT` (default
4199), `E2E_LOG_DIR` (default `tests/e2e/.logs`, holds `server.log`,
`mock.log`, `migrate.log`).

## Known expectations

- The script refuses to start if anything already answers on the API or
  mock port, and kills both servers' whole process groups on exit. If a
  run was interrupted hard, find the leftover with
  `pgrep -f "tsx src/index.ts"` and stop it, or pick other ports.

- Migration `039_student_avatars.sql` inserts into Supabase's
  `storage.buckets`, which plain Postgres lacks. `run-e2e.sh` detects that
  single failure, applies the portable part (`students.avatar_url`) by hand,
  records 039 and lets the migrate script continue. Nothing else is skipped.
- The financial rate limiter is one 20-requests-per-5-minutes bucket per
  client IP, shared by student payment routes and admin payout routes. The
  driver sends admin calls with `X-Forwarded-For: 10.0.0.2` (honoured because
  the app sets `trust proxy`) so they get their own bucket, exactly as a
  real admin on another network would.

## What it does NOT prove

The mock encodes the Cyzora contract as described in the integration brief.
Field names that could not be checked against the live documentation from
the build environment are listed in `TESTING.md` under "Confirm against the
docs on the first run". Passing here means *our* side behaves correctly for
that contract; the first run with a real `sk_test_` key confirms the
contract itself.
