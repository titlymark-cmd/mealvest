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
