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
