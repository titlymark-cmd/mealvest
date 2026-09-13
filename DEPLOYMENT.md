# Mealvest — Netlify + Supabase + Paystack Deployment

**Update**: an earlier version of this document said the Express
backend couldn't run on Netlify. That's now resolved — see below.
The backend runs as a single Netlify Function wrapping the existing,
unmodified Express app (`netlify/functions/api.ts` + `netlify.toml`).
No route, controller, or service file was rewritten to make this
work.

---

## 1. Architecture, as actually built

```
Phone browser
  → https://your-site.netlify.app          (web-exported Expo app, static files)
  → https://your-site.netlify.app/api/...  (redirected to one Netlify Function
                                             wrapping the existing Express app)
  → Supabase Postgres                       (DATABASE_URL, unchanged pg client)
Paystack ← webhook → https://your-site.netlify.app/api/webhooks/paystack
```

Frontend and backend are now the **same site, same domain** — this
actually simplifies CORS versus the earlier separate-hosts plan.

---

## 2. What I changed to make this possible

- **`netlify/functions/api.ts`** (new) — wraps `createApp()` from
  `server/src/app.ts` with `serverless-http`. The Express app itself
  was not touched.
- **`netlify.toml`** (new) — build command, function directory,
  `/api/*` redirect, SPA fallback for client-side navigation, and
  `external_node_modules = ["bcrypt"]` (bcrypt has native C++
  bindings that can't be bundled by esbuild like pure-JS code — this
  tells Netlify to install it separately so it's compiled correctly
  for the deployed environment).
- **Root `package.json`** (new) — holds `serverless-http` as a
  dependency (Netlify's function bundler resolves `node_modules` by
  walking up from the function file, and this is the nearest
  ancestor `package.json`), plus the orchestrated build script.
- **`react-dom` and `react-native-web` added to `app/package.json`**
  — these were missing, and `expo export --platform web` cannot
  produce any output without them. This was a real gap, not a style
  choice.
- **One bug I caught and fixed before it shipped**: Netlify's
  `/api/*` redirect delivers paths like
  `/.netlify/functions/api/orders` to the function, but the existing
  Express app expects `/api/orders` (every route file mounts under
  `/api/...`). Without a fix, every single request would have 404'd
  despite all the application code being correct. Fixed with a small
  path rewrite, isolated entirely inside `netlify/functions/api.ts` —
  no other file touched.

## 3. What I could NOT verify (being direct about this)

This sandbox has no network access — I cannot run an actual Netlify
build or send a real request to a deployed function. The path-rewrite
logic above matches Netlify's documented behavior, but **the first
thing to test after your first deploy** is literally: does
`https://your-site.netlify.app/api/health` return `{"status":"ok"}`?
If it 404s, tell me the exact response and I'll adjust the rewrite.

---

## 4. Supabase setup

1. Create a Supabase project.
2. Project Settings → Database → Connection string.
3. **Use "Transaction" pooler mode (port 6543), not the direct
   connection (port 5432).** This matters more here than it would for
   a normal server: Netlify Functions can spin up multiple concurrent
   instances under load, each potentially opening its own connection
   pool. Supabase's direct Postgres connection has a hard connection
   limit that a burst of concurrent function invocations can exhaust
   quickly; the pooler is built exactly for this pattern.
4. Set that connection string as `DATABASE_URL` in Netlify's
   environment variables (Site settings → Environment variables) —
   never in a committed file.
5. Run migrations against it once, from your own machine:
   ```bash
   cd server
   DATABASE_URL="your-supabase-pooler-connection-string" npm run migrate
   ```
6. Supabase's own Auth product is intentionally NOT used — Mealvest
   already has its own JWT auth system; Supabase here is purely
   hosted Postgres.

---

## 5. Paystack

1. Dashboard (Test Mode) → Settings → API Keys & Webhooks → copy Test
   Secret + Public keys.
2. Set on Netlify: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`.
3. Once your first deploy is live, set the webhook URL in Paystack to:
   `https://your-site.netlify.app/api/webhooks/paystack`
4. `env.ts`'s live-key safety check still applies — a `sk_live_...`
   key is refused unless `NODE_ENV=production` is set, so confirm
   that's set in Netlify's environment variables.

---

## 6. Google Authentication

Unchanged logic — deployment-readiness is entirely about registering
your new domain in Google Cloud Console:

1. APIs & Services → Credentials → your Web application OAuth client.
2. Add `https://your-site.netlify.app` to Authorized JavaScript
   origins and redirect URIs.
3. iOS/Android client IDs don't need this (they key off bundle
   ID/package name, not a domain).

---

## 7. Environment variables — split exactly as requested

**Server-only secrets** (Netlify env vars — never in `app/.env`,
never committed):
```
DATABASE_URL=<supabase pooler connection string>
JWT_ACCESS_SECRET=<openssl rand -hex 32>
QR_SIGNING_SECRET=<openssl rand -hex 32, different from above>
PAYSTACK_SECRET_KEY=<test key for now>
GOOGLE_CLIENT_IDS=<web,ios,android — comma-separated>
NODE_ENV=production
ALLOWED_ORIGINS=https://your-site.netlify.app
```

**Public/client-safe** (baked into the Expo web build — these are
visible in the shipped JS bundle by nature, which is fine, they're
not secrets):
```
EXPO_PUBLIC_API_BASE_URL=          # leave EMPTY — same-origin now, calls go to /api/... on the same domain
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
GOOGLE_MAPS_API_KEY=
PAYSTACK_PUBLIC_KEY=               # public key is meant to be client-visible; this is normal for Paystack
```

**Never put `PAYSTACK_SECRET_KEY`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, or `QR_SIGNING_SECRET` in anything under `app/`** — those stay server-only.

---

## 8. GitHub

- `.gitignore` already covers `node_modules/`, both `.env` files,
  build output (`server/dist`, `app/dist`, `app/.expo`).
- Confirmed no real `.env` file exists anywhere in this project —
  only sanitized `.env.example` templates.
- I cannot push to GitHub myself (no network access here) — from VS
  Code, use Source Control → Publish to GitHub (private repo), same
  as before.

---

## 9. Real-money testing — staged, per your requirement

1. **No money needed**: register/login, browse hotels/menus, terms
   disclaimer flow, RBAC checks (student hitting hotel/admin routes
   → 403).
2. **Paystack TEST mode**: full payment → webhook → budget-funding
   loop, using Paystack's test card/mobile money numbers. No real
   money moves.
3. **Requires YOUR decision, not a technical step**: switching
   `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` to live keys. Do this
   only after step 2 has been run successfully at least once and
   you've manually confirmed the webhook fires correctly on the
   deployed URL.
4. Before any real money: confirm the Supabase pooler connection is
   stable under a few concurrent test requests, and confirm the QR
   redemption idempotency check actually blocks a double-scan on the
   deployed function (not just locally) — both are things that only
   the deployed environment can truly confirm.

---

## Deployment checklist (your requested format)

1. **Project status**: existing MealVest codebase, unmodified business logic, adapted for Netlify.
2. **What I fixed**: added the Netlify Function adapter + path-rewrite bug fix, `netlify.toml`, root `package.json` for `serverless-http`, missing `react-dom`/`react-native-web` web-export dependencies, `.gitignore`.
3. **What remains**: everything in section 3 above (live verification), plus real Google/Paystack credentials only you can generate.
4. **GitHub**: push from VS Code as described in section 8.
5. **Netlify setup**: connect the GitHub repo → Netlify auto-detects `netlify.toml` → set env vars from section 7 → deploy.
6. **Supabase setup**: section 4 — pooler connection string, run migrations once.
7. **Paystack setup**: section 5 — test keys first, webhook URL after first deploy.
8. **Required environment variables**: full list in section 7.
9. **Production build status**: cannot be run in this sandbox (no network) — Netlify will run `npm run build` on its own infrastructure on your first deploy; watch that build log for the actual result.
10. **Public URL**: assigned by Netlify on first successful deploy (`https://<something>.netlify.app`, or your own custom domain later).
11. **First testing procedure**: (1) hit `/api/health` directly, confirm it responds — this is the one thing this sandbox couldn't verify for you; (2) register a student through the deployed URL; (3) run one Paystack TEST payment end to end; (4) confirm the webhook actually reaches the deployed function (Paystack's dashboard shows delivery attempts).
