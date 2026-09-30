import rateLimit from "express-rate-limit";

/**
 * Applied only to /api/auth/login and /api/auth/register/* — these
 * are the endpoints an attacker would hammer for credential stuffing
 * or account enumeration. Generous enough not to lock out a genuine
 * user who mistypes their password a few times, tight enough to
 * blunt automated attempts.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please try again later." } },
});

/**
 * Applied to payment-initiation and order-creation — unlike the auth
 * limiter above, these routes already require a valid access token,
 * so this isn't defending against credential stuffing; it's defending
 * against a single compromised/malicious student account hammering
 * Paystack initialize calls or spamming order rows. Generous enough
 * that no real student placing several orders a day ever notices it.
 */
export const financialActionRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many requests. Please slow down and try again shortly." } },
});

/**
 * Self-service "Test Notification" button and admin device-registration
 * churn — generous enough that legitimate use (a student re-testing
 * after fixing browser permissions, a device re-registering on every
 * app load) never trips it, tight enough to blunt abuse of an endpoint
 * that ultimately triggers a real push/SMS send.
 */
export const notificationActionRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many requests. Please slow down and try again shortly." } },
});

/**
 * Admin broadcast/test-send — tighter than the self-service limiter
 * above since a single call can fan out to hundreds of recipients;
 * this is defense against an accidental double-click or a compromised
 * admin session, not normal admin usage.
 */
export const adminNotificationRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many broadcast requests. Please wait before sending another." } },
});
