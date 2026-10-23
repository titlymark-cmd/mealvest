import "dotenv/config";

/**
 * Fail-fast env loading: the server refuses to start at all if a
 * required variable is missing, rather than limping along and
 * failing confusingly later (e.g. a DB pool that silently never
 * connects, or JWTs silently signed with `undefined` as the secret).
 */

const REQUIRED_VARS = ["DATABASE_URL", "JWT_ACCESS_SECRET", "QR_SIGNING_SECRET"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

/**
 * APP_BASE_URL is the ONLY source for links the server puts in emails
 * and redirect URLs (M5/L4). Must be an absolute http(s) origin; https
 * is required in production (http only for localhost). Required in
 * production: a missing value would otherwise push code paths toward
 * request-derived (attacker-controlled) hosts.
 */
function validatedAppBaseUrl(): string {
  const raw = (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  const production = process.env.NODE_ENV === "production";
  if (!raw) {
    if (production) {
      throw new Error("Missing required environment variable in production: APP_BASE_URL (e.g. https://mealvest.vercel.app).");
    }
    return "";
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`APP_BASE_URL is not a valid absolute URL.`);
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new Error("APP_BASE_URL must use https (http is allowed only for localhost).");
  }
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
    throw new Error("APP_BASE_URL must be a bare origin like https://example.com (no path, query or credentials).");
  }
  return u.origin;
}

function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number (got "${raw}").`);
  }
  return n;
}

for (const name of REQUIRED_VARS) {
  requireEnv(name);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
  // Was previously read lazily via process.env directly inside
  // lib/qr.ts — meaning a missing value wouldn't be caught until the
  // first QR generate/redeem call, in production, mid-order. Fail
  // fast at boot instead, same as the two secrets above.
  qrSigningSecret: requireEnv("QR_SIGNING_SECRET"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",
  // Not in REQUIRED_VARS on purpose — Google Sign-In is one auth
  // method among several (email/password registration still works
  // without it), so an unconfigured deployment shouldn't fail to
  // boot entirely over this. The /auth/google route itself checks
  // for these and returns a clear 500 error if hit while unset,
  // rather than the whole server refusing to start.
  //
  // Comma-separated because Expo issues a DIFFERENT OAuth client ID
  // per platform (iOS, Android, Web) for the same logical app —
  // google-auth-library's verifyIdToken accepts an array of accepted
  // audiences, so all of them go here.
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // -----------------------------------------------------------------
  // Paystack — not in REQUIRED_VARS, same reasoning as Google above:
  // it's one payment provider among what will eventually be several,
  // and this app has other things to boot for even before payments
  // are configured. The initialize/webhook routes check for these
  // themselves and return a clear error if unset, rather than the
  // whole server refusing to start.
  // -----------------------------------------------------------------
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  // Which provider the generic /api/payments/initialize, /boost/initialize
  // and admin payout endpoints use for NEW payments/payouts: "paystack"
  // (default, unchanged behaviour) or "cyzora". Verification of an
  // existing payment always follows the provider recorded on its own
  // transactions row, so flipping this never strands an in-flight payment.
  paymentProviderDefault: process.env.PAYMENT_PROVIDER_DEFAULT || "paystack",

  // -----------------------------------------------------------------
  // Cyzora — Kenyan M-Pesa payments API (STK push, hosted checkout,
  // payouts). Same "not in REQUIRED_VARS" reasoning as Paystack: the
  // Cyzora routes check for these themselves and return a clear error
  // if unset. The SECRET key (sk_test_/sk_live_) is sent as X-API-Key
  // from server code only — never to the browser. The webhook secret
  // (whsec_...) is a different value, from the dashboard's Webhooks
  // page, used only to HMAC-verify incoming webhook bodies. Cyzora's
  // public key (pk_...) only identifies the business to its hosted
  // checkout page and isn't needed server-side, so it isn't read here.
  // -----------------------------------------------------------------
  cyzoraSecretKey: process.env.CYZORA_SECRET_KEY || "",
  cyzoraWebhookSecret: process.env.CYZORA_WEBHOOK_SECRET || "",
  cyzoraBaseUrl: process.env.CYZORA_BASE_URL || "https://api.cyzora.co.ke/api/v1",

  // Public origin of the deployed app (e.g. https://mealvest.vercel.app),
  // used to build hosted-checkout callback_url/cancel_url. Optional:
  // when unset the controller derives it from the incoming request's
  // own protocol/host (see app.set("trust proxy") in app.ts). Cyzora
  // requires https here (plain http only for localhost).
  appBaseUrl: validatedAppBaseUrl(),

  // -----------------------------------------------------------------
  // Supabase Storage — used ONLY for hotel/meal image uploads (see
  // storageService.ts). This app has never used the Supabase JS SDK or
  // its REST API for anything else (Postgres is reached over a plain
  // pg connection, per DEPLOYMENT.md) — this is a thin axios client
  // against Storage's own HTTP API, matching how every other
  // third-party integration in this codebase (Paystack, Google,
  // Daraja) is a hand-rolled client rather than an SDK. Not in
  // REQUIRED_VARS: image upload is one feature among many, and an
  // unconfigured deployment shouldn't fail to boot over it — the
  // upload route itself returns a clear error if these are unset.
  // -----------------------------------------------------------------
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // -----------------------------------------------------------------
  // Email (Resend) — used only for the forgot-password reset link, per
  // the same "not in REQUIRED_VARS" reasoning as Paystack/Google/
  // Supabase above: the whole server shouldn't refuse to boot over one
  // feature. requestPasswordReset itself returns a clear error if this
  // is unset, rather than silently pretending to send anything.
  // onboarding@resend.dev works immediately with just an API key (no
  // domain verification needed) — fine to start with, but swap
  // EMAIL_FROM to a verified sending domain before relying on this for
  // real delivery to Gmail/Outlook, which are stricter about it.
  // -----------------------------------------------------------------
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "MEALVEST <onboarding@resend.dev>",

  // -----------------------------------------------------------------
  // Firebase Cloud Messaging (web push) — SERVER-SIDE credentials only,
  // used to actually send push messages via FCM's HTTP v1 API (see
  // fcmService.ts, which calls it directly with an access token from
  // google-auth-library rather than pulling in the firebase-admin SDK
  // — same hand-rolled-client convention as every other integration in
  // this codebase). The PUBLIC web config (apiKey, projectId,
  // messagingSenderId, appId, vapidKey) is a separate, non-secret set
  // of values baked into the CRA frontend at build time via
  // REACT_APP_FIREBASE_* — never read here, never sent through this
  // server. Not in REQUIRED_VARS: push is one notification channel
  // among several: the server boots fine without it, notificationService
  // just can't actually send push until these are set.
  // -----------------------------------------------------------------
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  // Vercel's env var UI can't store real newlines reliably, so the
  // private key is stored with literal "\n" sequences and unescaped
  // here — a well-known gotcha with this exact credential shape.
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),

  // -----------------------------------------------------------------
  // SMS — provider-agnostic (see smsService.ts's SmsProvider
  // interface). smsProvider selects which concrete implementation to
  // use; only that provider's own credentials below are ever read.
  // Africa's Talking is the only implementation shipped now (the
  // standard SMS gateway for Kenya, pairing naturally with this
  // M-Pesa-centric app) — swapping to another provider later means
  // adding one new file implementing the same interface, not rewriting
  // the notification system. Not in REQUIRED_VARS, same reasoning as
  // Firebase above.
  // -----------------------------------------------------------------
  smsProvider: process.env.SMS_PROVIDER || "",
  africasTalkingApiKey: process.env.AFRICASTALKING_API_KEY || "",
  africasTalkingUsername: process.env.AFRICASTALKING_USERNAME || "",
  africasTalkingSenderId: process.env.AFRICASTALKING_SENDER_ID || "",

  // -----------------------------------------------------------------
  // Cron — Vercel automatically sends `Authorization: Bearer
  // <CRON_SECRET>` on requests it triggers for a path listed under
  // "crons" in vercel.json, when CRON_SECRET is set. The meal-reminder
  // endpoint (routes/cron.routes.ts) checks the incoming header against
  // this value so the endpoint can't be triggered by an arbitrary
  // public request — never set in REQUIRED_VARS since the server boots
  // fine without scheduled reminders configured yet.
  // -----------------------------------------------------------------
  cronSecret: process.env.CRON_SECRET || "",

  // -----------------------------------------------------------------
  // Hotel payout limits (finding H3). A payout above the per-payout
  // limit, or one that would push the day's payouts above the daily
  // limit, is created in 'review' and is never sent until an admin
  // approves it. Whole KSh. Defaults are deliberately conservative for
  // a campus pilot — raise them explicitly in production config.
  // -----------------------------------------------------------------
  payoutMaxAmountKes: positiveNumberEnv("PAYOUT_MAX_AMOUNT_KES", 50_000),
  payoutDailyLimitKes: positiveNumberEnv("PAYOUT_DAILY_LIMIT_KES", 200_000),

  // -----------------------------------------------------------------
  // Automated hotel payouts. Evaluated after every QR redemption (see
  // orderService.redeemOrderByQr -> hotelPayoutService.evaluateAutoPayout).
  //   AUTO_PAYOUTS_ENABLED          master switch, OFF unless exactly
  //                                 "true" — enable only after the Cyzora
  //                                 payout webhook is confirmed working.
  //   AUTO_PAYOUT_THRESHOLD_KES     minimum accumulated unpaid hotel
  //                                 earnings (>=) before a payout is sent.
  //                                 Also applied to manual admin payouts.
  //   AUTO_PAYOUT_MAX_CONSECUTIVE_FAILURES / _FAILURE_COOLDOWN_MINUTES
  //                                 stop automatic retry loops after
  //                                 definitive failures; an admin can
  //                                 still trigger manually.
  //   PAYOUT_STALE_PROCESSING_MINUTES
  //                                 a 'processing' payout older than this
  //                                 is flagged for admin attention.
  // -----------------------------------------------------------------
  autoPayoutsEnabled: process.env.AUTO_PAYOUTS_ENABLED === "true",
  autoPayoutThresholdKes: positiveNumberEnv("AUTO_PAYOUT_THRESHOLD_KES", 40),
  autoPayoutMaxConsecutiveFailures: positiveNumberEnv("AUTO_PAYOUT_MAX_CONSECUTIVE_FAILURES", 3),
  autoPayoutFailureCooldownMinutes: positiveNumberEnv("AUTO_PAYOUT_FAILURE_COOLDOWN_MINUTES", 60),
  payoutStaleProcessingMinutes: positiveNumberEnv("PAYOUT_STALE_PROCESSING_MINUTES", 120),
};

// Loud, boot-blocking guard: a live-looking secret key outside a
// production environment is almost always a mistake (someone pasted
// the wrong key into local .env) and it's cheap to catch here before
// it ever gets a chance to move real money.
if (env.cyzoraSecretKey.startsWith("sk_live_") && !env.isProduction) {
  throw new Error(
    "CYZORA_SECRET_KEY looks like a LIVE secret key (sk_live_...) but NODE_ENV is not " +
      "'production'. Refusing to start — use a TEST key (sk_test_...) for local/staging, " +
      "or set NODE_ENV=production if this is genuinely production."
  );
}

if (env.paystackSecretKey.startsWith("sk_live_") && !env.isProduction) {
  throw new Error(
    "PAYSTACK_SECRET_KEY looks like a LIVE secret key (sk_live_...) but NODE_ENV is not " +
      "'production'. Refusing to start — use a TEST key (sk_test_...) for local/staging, " +
      "or set NODE_ENV=production if this is genuinely production."
  );
}

