# MEALVEST — Day 1–2: Architecture, Auth & Sessions

Campus meal subscription and digital food wallet app.

- **Day 1:** project skeleton — Expo app, Express API, PostgreSQL,
  role scaffolding, health check round trip.
- **Day 2 (this update):** real authentication — registration,
  login, JWT access + refresh tokens, working role guards, and the
  frontend session layer (`AuthContext`, SecureStore, role-based
  navigation routing).

See **`TESTING.md`** for a full manual test script (curl commands)
proving register → login → role-guard-block → refresh → logout.

## Stack

- **Frontend:** React Native + Expo, TypeScript, React Navigation
- **Backend:** Node.js + Express, TypeScript
- **Database:** PostgreSQL, plain SQL migrations (no ORM yet)

### Why Express over Fastify
Express for Day 1: it's the stack most contributors will already
know, the middleware ecosystem (helmet, cors, etc.) is the most
mature, and for a small campus-pilot API the raw throughput
difference vs. Fastify doesn't matter yet. Nothing here locks us in —
the route/controller structure would port to Fastify without a
rewrite if the API's traffic profile ever demanded it.

### Why plain `pg` over Prisma/Drizzle
Hand-written SQL migrations and a plain `pg` pool for Day 1: the
schema is small, every table is money-adjacent eventually (budgets,
orders, payouts), and being able to read the exact SQL that runs is
worth more right now than an ORM's convenience. Trade-off: more
boilerplate per query, no generated types. Drizzle (closer to raw SQL
than Prisma, with real TypeScript types) is the natural next step
once the schema stabilizes past the pilot — the SQL migration files
in `/server/migrations` aren't wasted work if we make that move later.

## Project structure

```
mealvest/
├── app/                        Expo React Native frontend
│   ├── App.tsx
│   ├── app.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── screens/
│       │   ├── WelcomeScreen.tsx       ← proves the backend round trip
│       │   ├── student/StudentHomeScreen.tsx
│       │   ├── hotelStaff/HotelStaffHomeScreen.tsx
│       │   ├── hotelOwner/HotelOwnerHomeScreen.tsx
│       │   └── admin/AdminHomeScreen.tsx
│       ├── navigation/
│       │   ├── RootNavigator.tsx       ← mounts Welcome only, for now
│       │   ├── StudentStack.tsx        ← scaffolded, not yet mounted
│       │   ├── HotelStaffStack.tsx     ← scaffolded, not yet mounted
│       │   ├── HotelOwnerStack.tsx     ← scaffolded, not yet mounted
│       │   └── AdminStack.tsx          ← scaffolded, not yet mounted
│       ├── services/
│       │   ├── config.ts               API base URL from env
│       │   └── api.ts                  fetch wrapper (getHealth)
│       ├── hooks/
│       │   └── useHealthCheck.ts
│       └── components/
│           └── PlaceholderScreen.tsx
│
└── server/                     Node/Express backend
    ├── src/
    │   ├── index.ts             entry point
    │   ├── app.ts               express app assembly
    │   ├── config/
    │   │   ├── env.ts           fail-fast env loader
    │   │   └── db.ts            pg connection pool
    │   ├── middleware/
    │   │   ├── auth.ts          requireAuth / requireRole (Day 2 stub)
    │   │   ├── errorHandler.ts
    │   │   └── requestLogger.ts
    │   ├── routes/               health, auth, student, hotel, admin
    │   ├── controllers/          matching controllers (mostly stubs)
    │   ├── models/
    │   │   └── userModel.ts     thin query helpers
    │   └── types/
    │       └── roles.ts
    ├── migrations/                001–007, run in filename order
    ├── scripts/
    │   └── migrate.js            migration runner (idempotent)
    ├── package.json
    ├── tsconfig.json
    └── .env.example
```

## Database schema (Day 1)

One shared `users` table (email, password_hash, role, auth_provider,
email_verified, account_status) plus a role-specific profile table
per role:

- `students` — full_name, institution, admission_number
- `hotels` — the business entity (name, location, payout details)
- `hotel_staff` — links a user to a hotel with a permission_level
  (`owner` / `staff`), covering both the `hotel_staff` and
  `hotel_owner` roles
- `admins` — platform-level MEALVEST staff

All tables have UUID primary keys (`gen_random_uuid()`), `created_at`,
and an auto-maintained `updated_at` (via a shared trigger function).
See `server/migrations/*.sql` for the full DDL with inline reasoning.

## Running it locally

### 1. PostgreSQL

Create a local database (adjust to your setup):

```bash
createdb mealvest_dev
```

### 2. Backend

```bash
cd server
cp .env.example .env
# edit .env: set DATABASE_URL to match your local Postgres,
# and generate JWT_ACCESS_SECRET with: openssl rand -hex 32

npm install
npm run migrate     # applies migrations 001–009 against mealvest_dev
npm run dev          # starts the API on http://localhost:4000
```

Confirm it's alive:

```bash
curl http://localhost:4000/api/health
# {"status":"ok","db":"connected","timestamp":"..."}
```

### 3. Frontend

In a second terminal:

```bash
cd app
cp .env.example .env
# if testing on a physical device or Android emulator, change
# EXPO_PUBLIC_API_BASE_URL to your computer's LAN IP instead of localhost

npm install
npm run start
```

Press `w` for web, or scan the QR code with Expo Go on your phone.
The Welcome screen calls `/api/health` on load and shows **"✓
Connected — DB: connected"** once both sides are talking — that's the
proof-of-life for Day 1.

## What's implemented as of Day 2

- Password hashing with bcrypt (never plaintext, never logged)
- Registration: `POST /api/auth/register/student`,
  `POST /api/auth/register/hotel` — both transactional (users +
  role-profile row created together or not at all)
- `mealvest_admin` has **no** self-registration route at all — created
  only via `npm run seed:admin` directly against the DB
- Login by email OR phone number (`identifier` field), generic
  "incorrect credentials" error either way (no account enumeration)
- JWT access tokens (15 min) + opaque, hashed, DB-stored refresh
  tokens (30 days, rotated on every use, revocable server-side)
- Real `requireAuth` / `requireRole` middleware — proven with live
  403s in `TESTING.md`, not just code review
- Rate limiting on `/api/auth/login`, `/api/auth/register/*`, and
  `/api/auth/pin/verify`; a separate limiter on payment-initiation and
  order-creation
- Frontend `AuthContext`/`useAuth`: session in memory, refresh token
  in Expo SecureStore (never AsyncStorage), silent refresh on app
  launch, automatic routing to the correct role stack
- 4-digit PIN quick-unlock: set during registration (or later via
  `POST /api/auth/pin`, which re-confirms the current password
  first), verified via `POST /api/auth/pin/verify` to refresh an
  existing session without retyping the password. 4 wrong attempts
  triggers a 15-minute timed lockout on the PIN path only — the
  account itself stays active and password login keeps working the
  whole time. See `server/migrations/027_add_pin_auth.sql` and
  `authService.verifyPinAndRefresh`.

## What's still NOT here yet

- Biometric / "simulated fingerprint" flows — later polish layer once
  this session-auth foundation is solid
- Meal plans, wallet, budget engine, QR/order flow
- Password reset, email verification, Google OAuth (all noted as
  future work; `auth_provider`/`email_verified` columns already exist
  to support them without another migration)
- Admin approval UI for pending hotel accounts (hotels are created
  with `status: 'pending_verification'` — nothing reviews them yet)
