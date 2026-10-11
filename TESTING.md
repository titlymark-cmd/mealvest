# MEALVEST — Day 2 Manual Test Script

Run the server first (`npm run dev` in `/server`), then run these in
order from a terminal. Requires `curl` and `jq` (or just read the raw
JSON if you don't have jq).

Base URL assumed: `http://localhost:4000`

---

## 1. Register a student

```bash
curl -s -X POST http://localhost:4000/api/auth/register/student \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Faith Achieng",
    "email": "faith.achieng@example.com",
    "phoneNumber": "0712345678",
    "password": "correcthorsebattery",
    "institution": "Maseno University"
  }' | jq
```

Expect: `201`, a JSON body with `accessToken`, `refreshToken`, and
`user.role: "student"`. Save the tokens:

```bash
STUDENT_ACCESS=$(curl -s -X POST http://localhost:4000/api/auth/register/student \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Second Student","email":"second@example.com","phoneNumber":"0712345679","password":"correcthorsebattery"}' \
  | jq -r .accessToken)

STUDENT_REFRESH=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"second@example.com","password":"correcthorsebattery"}' \
  | jq -r .refreshToken)
```

**Duplicate check:** run the exact same register request again —
expect `409 ACCOUNT_EXISTS`, not a 500 or a raw DB error.

## 2. Register a hotel owner

```bash
curl -s -X POST http://localhost:4000/api/auth/register/hotel \
  -H "Content-Type: application/json" \
  -d '{
    "ownerFullName": "Grace Achieng",
    "email": "grace@lakeviewhotel.com",
    "phoneNumber": "0723456789",
    "password": "correcthorsebattery",
    "hotelName": "Lakeview Hotel",
    "location": "Homa Bay Town",
    "payoutMethod": "mpesa",
    "payoutAccount": "174379"
  }' | jq
```

Expect: `201`, `user.role: "hotel_owner"`.

```bash
HOTEL_ACCESS=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"grace@lakeviewhotel.com","password":"correcthorsebattery"}' \
  | jq -r .accessToken)
```

## 3. Login

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"0712345678","password":"correcthorsebattery"}' | jq
```

Note this uses the **phone number** as the identifier, proving login
accepts either email or phone.

**Wrong password:**

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"faith.achieng@example.com","password":"wrongpassword"}'
```

Expect `401` with `INVALID_CREDENTIALS` — and compare against a
login with a non-existent identifier:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"nobody@example.com","password":"whatever123"}'
```

Both should return the **exact same** error message/code — proving
we don't leak which one failed.

## 4. Role guard — prove it actually blocks

```bash
# Student token hitting the STUDENT-only route -> should succeed
# past the guard (501 "not implemented" is fine — that means the
# guard let it through to the stub controller)
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/student/profile \
  -H "Authorization: Bearer $STUDENT_ACCESS"

# Student token hitting the HOTEL-only route -> must be 403
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/hotel/dashboard \
  -H "Authorization: Bearer $STUDENT_ACCESS"

# Student token hitting the ADMIN-only route -> must be 403
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/admin/overview \
  -H "Authorization: Bearer $STUDENT_ACCESS"

# Hotel owner token hitting the hotel route -> 501 (passed the guard)
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/hotel/dashboard \
  -H "Authorization: Bearer $HOTEL_ACCESS"

# No token at all -> 401
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/student/profile
```

Expect exactly: `501, 403, 403, 501, 401` in that order.

## 5. Refresh

```bash
curl -s -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$STUDENT_REFRESH\"}" | jq
```

Expect a **new** access token and a **new** refresh token (rotation —
the old refresh token is now revoked). Prove rotation by immediately
reusing the OLD refresh token:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$STUDENT_REFRESH\"}"
```

Expect `401 INVALID_REFRESH_TOKEN` — the old token no longer works.

## 6. Logout

```bash
NEW_REFRESH=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"faith.achieng@example.com","password":"correcthorsebattery"}' \
  | jq -r .refreshToken)

curl -s -X POST http://localhost:4000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH\"}" | jq
# {"loggedOut": true}

# Confirm it's actually revoked:
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH\"}"
```

Expect `401 INVALID_REFRESH_TOKEN` after logout.

## 6b. PIN quick-unlock — set, verify, and the 4-attempt lockout

Registration now requires a 4-digit `pin` alongside the password
(both `/register/student` and `/register/hotel`). Verified end-to-end
against a real local Postgres while building this feature — every
command below was actually run, not just written:

```bash
STUDENT_REFRESH=$(curl -s -X POST http://localhost:4000/api/auth/register/student \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Pin Tester","email":"pintester@example.com","phoneNumber":"0712399999","password":"correcthorsebattery","pin":"5678"}' \
  | jq -r .refreshToken)
```

**Correct PIN unlocks (and rotates tokens, same as /refresh):**

```bash
curl -s -X POST http://localhost:4000/api/auth/pin/verify \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$STUDENT_REFRESH\",\"pin\":\"5678\"}" | jq
```

Expect a fresh `accessToken`/`refreshToken` pair. Save the new
refresh token for the next steps (the old one is now revoked, exactly
like a normal refresh).

**Wrong PIN, 4 times in a row, locks the PIN path (not the account):**

```bash
REFRESH=<the refresh token from the successful unlock above>
for i in 1 2 3 4; do
  curl -s -w " -> %{http_code}\n" -X POST http://localhost:4000/api/auth/pin/verify \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH\",\"pin\":\"0000\"}"
done
```

Expect: `PIN_INCORRECT` with "3 attempts left", "2 attempts left", "1
attempt left", then `423 PIN_LOCKED` on the 4th. A 5th attempt (even
with the CORRECT pin) still returns `423 PIN_LOCKED` — but password
login for the same account keeps working the entire time:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"pintester@example.com","password":"correcthorsebattery"}'
```

Expect `200`, a normal token pair — proving the lockout is scoped to
the PIN-unlock path only, never the account itself.

**Changing the PIN requires the current password:**

```bash
ACCESS=<an access token from any successful login/unlock above>

# No currentPassword -> validation error
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/pin \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS" \
  -d '{"pin":"4321"}'

# Wrong currentPassword -> 401
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/pin \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS" \
  -d '{"pin":"4321","currentPassword":"wrongpassword"}'

# Correct currentPassword -> succeeds, and clears any prior lockout
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/pin \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ACCESS" \
  -d '{"pin":"4321","currentPassword":"correcthorsebattery"}'
```

Expect `400`, `401`, then `200 {"pinSet":true}` in that order.

## 7. mealvest_admin cannot self-register

There is no `/api/auth/register/admin` route at all:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:4000/api/auth/register/admin \
  -H "Content-Type: application/json" -d '{}'
```

Expect `404` — the route doesn't exist. The only way to create an
admin is:

```bash
cd server
npm run seed:admin "MEALVEST Admin" admin@mealvest.app 0700000000 "a-strong-password"
```

## 8. Rate limiting

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"faith.achieng@example.com","password":"wrongpassword"}'
done
```

Expect the first 10 to return `401`, then `429 TOO_MANY_ATTEMPTS` for
the rest within the 15-minute window.

---

## Frontend proof (manual, in the Expo app)

1. `npm run start` in `/app`, open on web or device.
2. Tap "I'm a student — create account", fill the form, submit →
   should land directly on the Student Home placeholder showing
   "Signed in as ...".
3. Force-close and reopen the app (or refresh the web tab) → should
   land back on Student Home automatically, no login prompt — this is
   the silent-refresh-on-launch flow reading the SecureStore-persisted
   refresh token.
4. Tap "Log out" → should return to Welcome.
5. Repeat steps 2–4 with "Registering a hotel? Sign up here" → should
   land on Hotel Owner Home instead.

---

## Paystack integration test checklist

Automated (no live network needed):

```bash
cd server
npm install
npm test
```

Runs `tests/payments.test.ts` — reference format/uniqueness, webhook
signature accept/reject, and `initializeSchema` boundary validation.
Requires a `.env` with `DATABASE_URL` and `JWT_ACCESS_SECRET` set
(same as running the server normally — nothing Paystack-specific is
required for these particular tests to pass, since they don't touch
the database).

### 1. Get TEST keys from Paystack

Paystack Dashboard → toggle **Test Mode** (top-right switch) → Settings
→ API Keys & Webhooks. Copy the **Test Secret Key** (`sk_test_...`)
and **Test Public Key** (`pk_test_...`) into `server/.env`:

```
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx
PAYSTACK_BASE_URL=https://api.paystack.co
PAYMENT_PROVIDER_DEFAULT=paystack
```

Never paste a `sk_live_...` key here while `NODE_ENV` isn't
`production` — `env.ts` will refuse to boot the server if you do,
on purpose.

### 2. Run the server

```bash
npm run migrate   # applies 017_multi_provider_payments.sql
npm run dev        # starts on http://localhost:4000 (PORT in .env overrides)
```

### 3. Expose it over HTTPS with ngrok

Paystack's webhook sender requires a public HTTPS URL — it cannot
reach `localhost`. In a second terminal:

```bash
ngrok http 4000
```

Copy the `https://xxxx.ngrok-free.app` URL ngrok prints.

### 4. Register the webhook URL in Paystack

Dashboard (still in Test Mode) → Settings → API Keys & Webhooks →
**Webhook URL** → paste:

```
https://xxxx.ngrok-free.app/api/webhooks/paystack
```

Save. Paystack signs every webhook call with your Test Secret Key —
that's exactly what `paystackProvider.handleWebhook()` verifies
against `PAYSTACK_SECRET_KEY` before trusting anything in the body.

### 5. Make a real TEST transaction

1. Sign in as a student in the app (or via `curl` against
   `/api/auth/login`), grab the access token.
2. `POST /api/payments/paystack/initialize` with
   `{ "amount": 5000, "numberOfDays": 30, "phone": "0712345678", "email": "test@example.com" }`
   and `Authorization: Bearer <token>`.
3. Open the returned `checkoutUrl` in a browser.
4. Paystack's test checkout accepts Kenya M-Pesa as a channel. Per
   Paystack's own test-mode documentation
   (https://paystack.com/docs/payments/test-payments/), use their
   currently-published test mobile money number/OTP for the Kenya
   M-Pesa flow — Paystack updates these values from time to time, so
   check that page directly rather than relying on a hardcoded number
   here going stale.
5. Watch the server logs: you should see the ngrok tunnel receive a
   POST to `/api/webhooks/paystack`, followed by the transaction
   flipping to `success` and a new row appearing in `budgets` for
   that student.
6. Confirm via `GET /api/payments/:reference/status` — should report
   `"status": "success"`.
7. Re-send the same webhook from ngrok's inspector (http://127.0.0.1:4040)
   to confirm idempotency — the budget should NOT be created a second
   time, and the endpoint should respond 200 either way.

### What's TEST-only vs. what changes for LIVE

- Swap `sk_test_/pk_test_` for `sk_live_/pk_live_` keys, and set
  `NODE_ENV=production` (required for the live-key guard to allow it).
- Re-register the webhook URL in Paystack's **Live Mode** settings —
  test and live webhook URLs are configured separately.
- The ngrok tunnel is a local-dev convenience only; in production the
  webhook URL is your real deployed server's HTTPS address.
- Everything else (reference generation, signature verification,
  idempotency logic, budget activation) is identical in both modes —
  only which Paystack environment you're pointed at changes.

---

## Cyzora integration test checklist

Cyzora (https://docs.cyzora.co.ke) sits next to Paystack behind the
same ledger (`transactions`), the same activation step
(`paymentService.activatePaymentIfNeeded`) and the same hotel payout
batching (`hotelPayoutService`). Which provider NEW payments and
payouts use is one switch: `PAYMENT_PROVIDER_DEFAULT=cyzora`. Existing
Paystack rows keep verifying against Paystack — verify always follows
the provider stored on the row.

> **Documentation caveat.** The integration was written from the
> Cyzora facts summarised in the project brief (endpoints, auth
> header, cents, statuses, webhook events, signature scheme, test
> numbers). The live docs site could not be fetched from the build
> environment, so a few *response/payload field names* are tolerant
> assumptions that the first test run should confirm — they're listed
> under "Confirm against the docs" below. Nothing is marked paid unless
> Cyzora's own verify endpoint reports `succeeded` **and** the amount
> matches, so a wrong field name fails closed (payment stays
> pending/flagged), never open.

Automated (no live network, no database):

```bash
cd server
npm install
npm test
```

Runs `tests/cyzora.test.ts` alongside `tests/payments.test.ts`:
webhook signature accept/reject on raw bytes (missing header, wrong
secret, tampered body, wrong length, upper-case hex), event-envelope
parsing, charge/payout status mapping, KES↔cents conversion, redirect
URL rules, error mapping, and settlement-method → payout-destination
mapping. `tests/setup.ts` supplies throwaway env values so no `.env`
is needed.

### 1. Keys and secrets (Cyzora dashboard)

1. **API Keys** → copy the **test secret key** (`sk_test_…`). Public
   keys (`pk_…`) only identify the business to the hosted checkout
   page and aren't used server-side.
2. **Webhooks** → add an endpoint for
   `https://<your-domain>/api/webhooks/cyzora` (ngrok URL for local
   dev, see step 3) and copy its **signing secret** (`whsec_…`).
3. **Redirect domains** (if your account restricts them) → add the
   frontend's domain (and the ngrok/localhost one for dev). Hosted
   checkout `callback_url`/`cancel_url` must be https — plain http is
   only accepted for localhost.

Into `server/.env`:

```
PAYMENT_PROVIDER_DEFAULT=cyzora
CYZORA_SECRET_KEY=sk_test_xxxxxxxxxxxx
CYZORA_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
CYZORA_BASE_URL=https://api.cyzora.co.ke/api/v1
APP_BASE_URL=http://localhost:3000      # where the CRA frontend runs locally
```

Never paste an `sk_live_…` key while `NODE_ENV` isn't `production` —
`env.ts` refuses to boot, same guard as Paystack.

### 2. Migrate and run

```bash
npm run migrate   # applies 040_cyzora_provider.sql (provider 'cyzora', provider_channel)
npm run dev
```

### 3. Expose the webhook over HTTPS

```bash
ngrok http 4000
```

Register `https://xxxx.ngrok-free.app/api/webhooks/cyzora` on the
Webhooks page (step 1.2) and put that endpoint's `whsec_` into
`CYZORA_WEBHOOK_SECRET`. Click **Send test** on the Webhooks page: the
server log should show `Cyzora webhook.test received` and the dashboard
a `200`. A wrong secret gets a `401` — that's the signature check
working, not a transport problem.

### 4. Test phone numbers (test mode, no real money)

| Phone          | Outcome                          |
|----------------|----------------------------------|
| 254700000001   | succeeds                         |
| 254700000002   | fails — balance too low          |
| 254700000003   | fails — customer cancelled       |
| 254700000004   | times out                        |

### 5. STK push — new plan (your own payment screen)

1. Sign in as a student (app or `POST /api/auth/login`), take the
   access token.
2. `POST /api/payments/initialize` (or the explicit
   `/api/payments/cyzora/initialize`) with
   `{ "amount": 5000, "numberOfDays": 30, "phone": "254700000001", "email": "test@example.com", "termsAccepted": true }`
   and `Authorization: Bearer <token>`. Expect `201` with
   `{ reference: "MV-…", displayText, provider: "cyzora" }`.
   In the DB: one `transactions` row, `status='pending'`,
   `provider='cyzora'`, `provider_channel='stk_push'`,
   `provider_transaction_id` = Cyzora's charge id, `amount=5000`.
   (Cyzora was sent `amount: 500000` — cents.)
3. Watch the log: ngrok receives `POST /api/webhooks/cyzora`
   (`charge.succeeded`, `livemode: false`). The handler verifies the
   signature, finds the row by `account_ref` (our MV- reference), calls
   `GET /charges/{id}` itself, and only then runs
   `activatePaymentIfNeeded` → row `status='success'`, a `budgets` row
   appears for the student.
4. `GET /api/payments/verify/MV-…` → `{ status: "success",
   alreadyProcessed: true, provider: "cyzora" }`. The frontend's
   `usePaymentStatusPoll` hits this same endpoint.
5. Repeat with `254700000002` and `254700000003`: webhook
   `charge.failed`, row → `failed`, **no** budget row, one "Payment
   failed" notification. With `254700000004`: stays `pending` until
   Cyzora reports `timeout` → `failed`.
6. **Duplicate delivery:** re-send the `charge.succeeded` event from
   the dashboard (or replay it from ngrok's inspector at
   http://127.0.0.1:4040). Expect `200`, `alreadyProcessed`, and
   exactly one budget — the row lock + `status='success'` guard in
   `activatePaymentIfNeeded` make the second run a no-op.
7. **Bad signature:** replay the same body with any other
   `X-Cyzora-Signature` → `401`, nothing changes.
8. **Amount mismatch (fails closed):** can't be produced with a real
   Cyzora charge, but `tests/cyzora.test.ts` covers the conversion and
   `activatePaymentIfNeeded` flags any verify-amount ≠ row-amount as
   `failed` + "Amount mismatch — flagged for review".

### 6. Meal Boost via STK

Same as step 5 against `POST /api/payments/boost/initialize` with
`{ "amount": 500, "phone": "254700000001", "email": "…" }` for a
student who already has an active plan — the existing budget's
`remaining_amount` rises once, and only once, after the webhook.

### 7. Hosted checkout (redirect)

1. On the plan set-up screen tick the terms and press **"Pay on
   Cyzora's secure checkout page instead"** (shown only when the server
   reports `hostedCheckoutAvailable` from `GET /api/payments/config`),
   or call `POST /api/payments/cyzora/checkout/initialize` with the
   same body as step 5.2. Expect `201` with `checkoutUrl`, `reference`
   and `expiresIn: 1800`. Row: `provider_channel='hosted_checkout'`,
   `provider_transaction_id` = Cyzora's session reference. The server
   sent `callback_url = <APP_BASE_URL>/payment/callback?reference=MV-…`
   and `cancel_url = <APP_BASE_URL>/student/budget-onboarding`.
2. Pay on the Cyzora page with `254700000001`. Cyzora redirects to
   `/payment/callback?reference=MV-…&status=success`. **That
   `status=success` is ignored.** The screen polls
   `GET /api/payments/verify/MV-…`, which calls
   `GET /transactions/verify/{cyzora reference}` and only reports what
   Cyzora's API says.
3. Pay with a failing number: Cyzora sends `charge.failed` with
   `retryable: true` while the session is still open — the handler
   deliberately leaves the row `pending` (the student can retry on the
   same page) and no "payment failed" notification goes out. A
   `charge.expired` after `expires_in` → `failed`.
4. Edit the callback URL in the browser to `…&status=success` on an
   unpaid reference → the screen keeps polling and ends in "We haven't
   received confirmation yet". Nothing is credited.

### 8. Hotel payouts (test mode)

1. Set the hotel's settlement method to `send_money` with phone
   `254700000001` (or `mpesa_till` / `paybill` with any test short
   code; `pochi_la_biashara` maps to a mobile destination). `bank` is
   reported as "needs manual payout" — see below.
2. Have at least KSh 30 of redeemed, unpaid orders for that hotel
   (Cyzora's minimum is 3000 cents). Admin → Hotel Payouts →
   **Pay out**, or `POST /api/admin/payouts/trigger { "hotelId" }`.
3. Expect a `hotel_payouts` row `provider='cyzora'`,
   `status='processing'`, `transfer_code` = Cyzora's payout id, with
   every claimed order's `payout_id` set. Cyzora received
   `POST /payouts` with `Idempotency-Key = PO-…` and `amount` in cents.
4. Webhook `payout.paid` → row `successful`, hotel staff notified once.
   `payout.failed` → row `failed`, the orders' `payout_id` cleared so
   the next payout can include them. Re-send the event → `200`, no
   change (`finalizePayoutStatus` only moves a `processing` row).
5. **Duplicate payout:** click **Pay out** twice quickly — the second
   call finds no unclaimed orders (`NOTHING_TO_PAY_OUT`) before Cyzora
   is ever contacted. A network retry of the same request reuses the
   same `Idempotency-Key`, so Cyzora wouldn't pay twice either.
6. `GET /api/admin/payouts/fee-preview?amount=1000` returns Cyzora's
   fee for a KSh 1,000 payout (`GET /payouts/fee-preview`). The fee is
   Cyzora's processing charge — it is **not** netted into the hotel's
   `hotel_amount`/MEALVEST's `commission_amount`, which stay exactly as
   `orderService.redeemOrderByQr` froze them.

### Confirm against the docs on the first run

Field names the code reads tolerantly (top level or under a `data`
envelope) because they weren't in the brief's fact list — check each
once in the server log / dashboard and tighten if needed:

- `POST /charges` response: the charge **id** (`id`).
- `GET /charges/{id}` and `GET /transactions/verify/{reference}`
  responses: `status` and `amount` (cents). A missing `amount` fails
  the amount check → row flagged `failed`, never credited.
- Webhook body: the charge/payout object (read from `data`, else
  `charge`/`payout`, else top level) and its `id` / `account_ref` /
  `reference`; `retryable` on `charge.failed` (read from the event or
  the object).
- `POST /payouts` response: `id`, `status`; fee field (`fee` or
  `fee_amount`) if reported.
- There was no documented per-payout read endpoint in the brief, so
  payouts finalize **only** via the signed `payout.paid`/`payout.failed`
  webhooks; "Refresh status" is a no-op for Cyzora rows. If the docs
  provide one, wire it into `hotelPayoutService.verifyPayout`.
- `bank` settlement needs a `bank_code` from `GET /payout-banks`
  matched to the hotel's free-text `bankName` — not automated until
  that list's shape is confirmed (`cyzoraPayoutService.listPayoutBanks`
  is there to inspect it).

### What changes for LIVE

- `sk_live_` key + `NODE_ENV=production`; a live `whsec_` for the
  production webhook endpoint (test and live endpoints are separate
  on the dashboard); `APP_BASE_URL=https://<your-domain>`.
- Live **payouts** require a verified Cyzora business — until then
  `POST /payouts` will be rejected and the payout row records the
  error with its orders released.
- A `livemode: false` event reaching a live-keyed server (or vice
  versa) is logged and ignored with `200` — it can never credit a
  live ledger.

---

## Full first-MVP walkthrough (student → payment → order → QR → hotel → withdrawal)

Run these in order against a running server (`npm run dev`, migrations
applied, `npm run seed:admin` already run once). Every response shown
is the shape to expect — exact IDs/timestamps will differ.

### 1. Create the platform admin (one-time, not an API call)

```bash
cd server
npm run seed:admin "Platform Admin" admin@mealvest.app 0700000000 "a-strong-password"
```

### 2. Admin logs in and registers a real hotel

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@mealvest.app","password":"a-strong-password"}' \
  | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/admin/hotels \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "Lakeview Hotel",
    "phone": "0712000002",
    "email": "owner@lakeviewhotel.co.ke",
    "location": "Homa Bay Town",
    "address": "Lakeside Road, Homa Bay Town",
    "ownerContactName": "Grace Achieng",
    "adminUsername": "lakeview.admin",
    "password": "hotelpassword123",
    "payment": { "method": "mpesa_till", "tillNumber": "174379", "businessName": "Lakeview Hotel" },
    "registrationFee": 5000,
    "commissionPercent": 8,
    "termsAccepted": true
  }'
```

Expect `201` with the new hotel row, `status: "active"` — an
admin-created hotel goes live immediately (no separate approval step
in the current flow, since the admin IS the approver by creating it).

### 3. Hotel logs in and adds menu items

```bash
HOTEL_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"owner@lakeviewhotel.co.ke","password":"hotelpassword123"}' \
  | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/hotel/menu \
  -H "Authorization: Bearer $HOTEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Chicken + Rice","price":250,"category":"lunch","description":"Grilled chicken, rice, kachumbari"}'
```

Copy the returned `item.id` — you'll need it in step 6.

### 4. Student registers and picks a plan

```bash
curl -s -X POST http://localhost:4000/api/auth/register/student \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Faith Achieng","email":"faith@example.com","phoneNumber":"0712345678","password":"studentpass123"}'

STUDENT_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"faith@example.com","password":"studentpass123"}' \
  | jq -r .accessToken)

curl -s http://localhost:4000/api/plans
# copy the "Hustler Plan" id

curl -s -X POST http://localhost:4000/api/student/budget \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"planId":"<hustler-plan-id>"}'
```

Expect a `budget` with `total_amount: 5000`, `daily_allowance` computed
server-side — this proves the plan price came from the catalog, not
anything the client sent.

**To test the pre-existing custom-amount path instead** (still works,
nothing removed): `{"totalAmount": 4500, "numberOfDays": 20}`.

### 5. Fund the budget via Paystack (real TEST transaction)

Follow the "Paystack integration test checklist" section above —
`POST /api/payments/paystack/initialize`, pay in the sandbox checkout,
confirm via webhook or `/verify`. This is the same flow already
documented; the only difference is the budget you're topping up now
came from a named plan.

### 6. Student creates and pays for an order

```bash
curl -s -X POST http://localhost:4000/api/orders \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"hotelId":"<lakeview-hotel-id>","items":[{"itemId":"<chicken-rice-item-id>","quantity":1}]}'
# copy the returned order.id

curl -s -X POST http://localhost:4000/api/orders/<order-id>/pay \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

Expect `order.status: "paid"` and a `qr_token` field like
`MEALVEST:1:<orderId>:<signature>` — that string is what a real QR
image would encode.

### 7. Hotel verifies, then redeems

```bash
curl -s -X POST http://localhost:4000/api/hotel/qr/verify \
  -H "Authorization: Bearer $HOTEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"qrPayload":"<the qr_token from step 6>"}'
# expect {"valid": true, "order": {...}}

curl -s -X POST http://localhost:4000/api/hotel/qr/redeem \
  -H "Authorization: Bearer $HOTEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"qrPayload":"<the qr_token from step 6>"}'
# expect {"valid": true, "message": "Meal redeemed successfully.", "order": {"status": "redeemed", "commission_amount": 20, "hotel_amount": 230, ...}}
```

**Duplicate test**: run the exact same `redeem` call again — expect
`{"valid": false, "code": "ALREADY_REDEEMED", ...}`, never a second
success.

### 8. Confirm the hotel dashboard reflects it

```bash
curl -s http://localhost:4000/api/hotel/dashboard -H "Authorization: Bearer $HOTEL_TOKEN"
```

Expect `stats.redeemed_orders: 1`, `stats.gross_revenue: 250`,
`stats.commission_owed: 20`, `stats.net_earnings: 230` — all computed
live from the `orders` table, not hardcoded.

### 9. Withdrawal — locked, then unlocked

```bash
curl -s http://localhost:4000/api/student/withdrawal-status -H "Authorization: Bearer $STUDENT_TOKEN"
# expect {"locked": true, "reason": "CONTRACT_ACTIVE", ...} — the plan hasn't ended yet
```

To actually test the unlocked path without waiting out a real 30-day
plan, manually backdate the budget's end date in the database (test
environment only):

```sql
UPDATE budgets SET end_date = CURRENT_DATE - 1 WHERE user_id = '<student-user-id>' AND status = 'active';
```

```bash
curl -s http://localhost:4000/api/student/withdrawal-status -H "Authorization: Bearer $STUDENT_TOKEN"
# now expect {"locked": false, ...}

curl -s -X POST http://localhost:4000/api/student/withdraw \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"payoutMethod":"mpesa","payoutDestination":"0712345678"}'
```

Expect `gross_savings` and `student_amount` to be **exactly equal** —
that's the corrected 100%-to-student model, provable from the response
alone. Run the same `withdraw` call again — expect `409
ALREADY_WITHDRAWN`, not a second payout.

### 10. Security check — wrong role, wrong hotel

```bash
# student token hitting a hotel-only route -> must be 403
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/hotel/dashboard -H "Authorization: Bearer $STUDENT_TOKEN"

# hotel token hitting admin-only route -> must be 403
curl -s -w "\n%{http_code}\n" http://localhost:4000/api/admin/overview -H "Authorization: Bearer $HOTEL_TOKEN"
```

Both must return `403`, proving role enforcement happens at the
backend regardless of what UI (or lack of one) is calling it.
