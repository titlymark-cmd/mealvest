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
  paymentProviderDefault: process.env.PAYMENT_PROVIDER_DEFAULT || "paystack",

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
};

// Loud, boot-blocking guard: a live-looking secret key outside a
// production environment is almost always a mistake (someone pasted
// the wrong key into local .env) and it's cheap to catch here before
// it ever gets a chance to move real money.
if (env.paystackSecretKey.startsWith("sk_live_") && !env.isProduction) {
  throw new Error(
    "PAYSTACK_SECRET_KEY looks like a LIVE secret key (sk_live_...) but NODE_ENV is not " +
      "'production'. Refusing to start — use a TEST key (sk_test_...) for local/staging, " +
      "or set NODE_ENV=production if this is genuinely production."
  );
}

