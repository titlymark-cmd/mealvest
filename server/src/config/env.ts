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
  // Where Paystack redirects the student's browser back to after
  // checkout (GET /payment/callback?reference=...). Optional — when
  // unset, the initialize endpoints derive it from the incoming
  // request's own protocol/host instead (this app serves frontend and
  // API from the same origin, so that's a reliable fallback and avoids
  // needing per-environment config for local/preview deployments).
  // Set this explicitly in production if the app ever sits behind a
  // proxy/CDN that doesn't forward X-Forwarded-* headers accurately.
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || "",

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

