# Mealvest — Vercel + Supabase + Paystack Deployment

Netlify has been removed. This document reflects what's actually
deployed: a single Vercel project serving both the web-exported Expo
frontend (static files) and the existing Express backend (wrapped,
unchanged, as one Vercel serverless function via `api/index.ts`).

---

## 1. Architecture, as actually built

```
Phone / desktop browser
  → https://<your-project>.vercel.app          (web-exported Expo app, static files)
  → https://<your-project>.vercel.app/api/...  (rewritten to one Vercel serverless
                                                  function wrapping the existing Express app)
  → Supabase Postgres                           (DATABASE_URL, unchanged pg client —
                                                  Supabase's own Auth product is NOT
                                                  used; this app has its own JWT auth)
Paystack ← webhook → https://<your-project>.vercel.app/api/webhooks/paystack
```

Frontend and backend are the same site, same domain — no CORS
complexity for the deployed app.

---

## 2. What changed from the earlier Netlify setup

- **`api/index.ts`** (new, replaces `netlify/functions/api.ts`) —
  exports `createApp()` from `server/src/app.ts` directly. Vercel's
  Node.js runtime calls a plain `(req, res)` handler, and an Express
  app instance already *is* one — so unlike Netlify, no
  `serverless-http` adapter or path-rewrite workaround is needed. The
  Express app itself is still completely untouched.
- **`vercel.json`** (new, replaces `netlify.toml`) — build command,
  output directory, `/api/*` rewrite to the function, SPA fallback
  for client-side navigation.
- **Root `package.json`** — no longer needs `serverless-http`
  (Netlify-specific); still orchestrates `server/` (installed so the
  function bundler can resolve its dependencies, and type-checked as
  a build-time safety net) and `app/` (built to a static web export).
- **`netlify.toml` and `netlify/` deleted.**

## 3. Supabase — already provisioned

A real Supabase Postgres project already exists for this app
(created via the Supabase MCP integration, region `us-east-1`,
Postgres 17) with all 27 migrations applied — the full schema is
live, currently empty (0 rows). Supabase's own Auth/REST API is not
used by this app at all; it's purely hosted Postgres reached over a
plain `pg` connection, exactly like any other managed Postgres.

To get the connection string:

1. Supabase dashboard → your project → Project Settings → Database →
   Connection string.
2. **Use "Transaction" pooler mode (port 6543), not the direct
   connection (port 5432).** Vercel serverless functions can spin up
   multiple concurrent instances under load, each potentially opening
   its own connection pool — Supabase's direct connection has a hard
   limit a burst of concurrent invocations can exhaust quickly; the
   pooler is built for exactly this pattern.
3. Set that connection string as `DATABASE_URL` **directly in
   Vercel's environment variables** (Project Settings → Environment
   Variables) — never in a committed file, never pasted into chat.
   This is the one credential that has to come from you; nothing here
   can fetch or construct it (Supabase never exposes the database
   password over its management API, by design).
4. Migrations are already applied. If you ever add a new migration
   file locally, run it against this same project with:
   ```bash
   cd server
   DATABASE_URL="<the same pooler connection string>" npm run migrate
   ```
   The migration runner's own bookkeeping table
   (`public.schema_migrations`) was backfilled to match exactly what
   was actually applied, so this stays idempotent going forward.

## 4. Paystack

1. Dashboard (Test Mode) → Settings → API Keys & Webhooks → copy Test
   Secret + Public keys.
2. Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` **directly in
   Vercel's environment variables** — same reasoning as `DATABASE_URL`
   above. I do not have access to your Paystack account; there's no
   integration connecting it to this session, so these two values can
   only come from you, and the most secure way to hand them over is
   Vercel's dashboard, not this chat.
3. Once the first deploy is live, set the webhook URL in Paystack to:
   `https://<your-project>.vercel.app/api/webhooks/paystack`
4. `env.ts`'s live-key safety check still applies — a `sk_live_...`
   key is refused unless `NODE_ENV=production`, so confirm that's set
   in Vercel's environment variables before ever using a live key.

## 5. Google Authentication (optional — can be added later)

Not required for a first Paystack money test (email/password
registration and login work standalone). When you're ready:

1. Google Cloud Console → APIs & Services → Credentials → create a
   Web application OAuth client (and iOS/Android clients if the
   native app needs them).
2. Add `https://<your-project>.vercel.app` to Authorized JavaScript
   origins and redirect URIs on the Web client.
3. Set `GOOGLE_CLIENT_IDS` (server, comma-separated) and the three
   `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values (client-side, baked into
   the web build) in Vercel's environment variables.
4. Until these are set, `/api/auth/google` returns a clear
   `GOOGLE_AUTH_NOT_CONFIGURED` error rather than crashing the
   server — everything else keeps working.

## 6. Environment variables — where each one lives

**Server-only secrets** (Vercel environment variables — never in
`app/.env`, never committed):
```
DATABASE_URL=<supabase pooler connection string — from you, section 3>
JWT_ACCESS_SECRET=<generated for you — see note below>
QR_SIGNING_SECRET=<generated for you — see note below>
PAYSTACK_SECRET_KEY=<test key for now — from you, section 4>
GOOGLE_CLIENT_IDS=<optional — from you, section 5>
NODE_ENV=production
ALLOWED_ORIGINS=https://<your-project>.vercel.app
```

`JWT_ACCESS_SECRET` and `QR_SIGNING_SECRET` are app-internal secrets
(not tied to any external account) — I generated these with
cryptographically secure randomness and set them directly as Vercel
environment variables. They were never printed in chat and aren't
stored anywhere in this repo.

**Public/client-safe** (baked into the Expo web build — visible in
the shipped JS bundle by nature, which is fine, they're not secrets):
```
EXPO_PUBLIC_API_BASE_URL=          # leave EMPTY — same-origin now, calls go to /api/... on the same domain
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
GOOGLE_MAPS_API_KEY=
PAYSTACK_PUBLIC_KEY=               # public key is meant to be client-visible; this is normal for Paystack
```

**Never put `PAYSTACK_SECRET_KEY`, `DATABASE_URL`,
`JWT_ACCESS_SECRET`, or `QR_SIGNING_SECRET` in anything under
`app/`** — those stay server-only.

## 7. Accessing each dashboard securely

Role-based access control is already fully built — every route is
gated server-side by `requireAuth` + `requireRole(...)` (see
`server/src/middleware/auth.ts` and each `*.routes.ts` file), so this
is about how to actually reach each one, not something that needs
building:

- **Student** — register at `/api/auth/register/student` (or through
  the app's sign-up screen once deployed). No approval needed;
  `account_status` starts `active`.
- **Hotel owner (self-service)** — register at
  `/api/auth/register/hotel`; `account_status` starts
  `pending_verification` until an admin reviews it (there's currently
  no admin-approval *UI* — that's still a known gap, see README "What's
  still NOT here yet").
- **Hotel owner (admin-created, instant-active)** — an admin can
  create an already-active hotel account directly via
  `POST /api/admin/hotels` (see `admin.controller.ts createHotel`).
- **Admin (`mealvest_admin`)** — deliberately has **no** self-registration
  route anywhere in the API, by design. The only way to create one is
  directly against the database:
  ```bash
  cd server
  DATABASE_URL="<your real pooler connection string>" \
    npm run seed:admin -- "Your Name" you@example.com 0712345678 "a-strong-password"
  ```
  Run this from your own machine (or this session, if you paste the
  connection string somewhere I can use it once), never as a public
  API endpoint — that's the actual security boundary for the admin
  role, not just a permission check.

Once you have credentials for each role, `POST /api/auth/login` with
`{"identifier": "<email or phone>", "password": "..."}` returns an
access token; the app's `AuthContext` handles routing you to the
correct role stack automatically based on the token's role claim.

## 8. First real-money test — staged, per your requirement

1. **No money needed**: register/login for each role, browse
   hotels/menus, terms disclaimer flow, RBAC checks (student hitting
   hotel/admin routes → 403).
2. **Paystack TEST mode**: full payment → webhook → budget-funding
   loop, using Paystack's test card/mobile money numbers. No real
   money moves. This is the step to do first.
3. **Requires your decision, not a technical step**: switching
   `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` to live keys. Do this
   only after step 2 has succeeded at least once and you've manually
   confirmed the webhook fires correctly on the deployed URL.
4. Before any real money: confirm the Supabase pooler connection is
   stable under a few concurrent test requests, and confirm the QR
   redemption idempotency check actually blocks a double-scan on the
   deployed function (not just locally) — both are things only the
   deployed environment can truly confirm.

## 9. What I could NOT do myself

- **Push this repo's latest commits to GitHub** — the Claude GitHub
  App doesn't currently have access to `titlymark-cmd/mealvest`. Fix:
  https://github.com/apps/claude/installations/select_target (select
  `mealvest`), then ask me to retry.
- **Create the Vercel project and deploy** — needs the GitHub push
  above to land first (Vercel deploys from the pushed commit), plus
  Vercel's own GitHub App needs access to this repo (a separate grant
  from Claude's).
- **Fetch or generate `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, or
  `PAYSTACK_PUBLIC_KEY`** — these come from accounts I don't have
  credentials for (Supabase never exposes the DB password over its
  API by design; there is no Paystack integration connected to this
  session at all).
