import crypto from "crypto";
import { Request } from "express";
import rateLimit, { MemoryStore, Options, Store, IncrementResponse } from "express-rate-limit";
import { ApiError } from "./errorHandler";
import { getRedis, isRedisConfigured } from "../lib/redis";
import { AuthedRequest } from "./auth";

/**
 * Rate limiting (finding H5).
 *
 * Previously every limiter used express-rate-limit's in-memory store —
 * per serverless instance, so on Vercel each new instance started with a
 * fresh budget and the limits were largely ineffective. Now:
 *
 *  - Counters live in Upstash Redis (lib/redis.ts), shared by every
 *    instance, with fixed windows (SET NX PX + INCR + PTTL, pipelined).
 *  - CRITICAL limiters (login, registration, PIN, refresh, password
 *    reset, verification, payments/orders/withdrawals/payouts) FAIL
 *    CLOSED: if Redis is unreachable the request is refused with 503
 *    RATE_LIMIT_UNAVAILABLE rather than allowed unlimited.
 *  - Non-critical limiters (notification self-tests) fall back to a local
 *    memory counter on a Redis error.
 *  - In production, Redis is REQUIRED for critical limiters. Running
 *    without it requires the explicit, logged opt-out
 *    RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true (emergency use only).
 *    In development/test the memory store is used when Redis is unset.
 *
 * Keys never contain raw identifiers: account-based keys are SHA-256
 * hashes, and the prefix names the limiter. IP comes from req.ip, which
 * honours app.set("trust proxy", ...) — on Vercel the edge sets
 * X-Forwarded-For itself, so clients cannot spoof it there.
 */

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
function allowMemoryFallback(): boolean {
  return process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === "true";
}

if (isProduction() && !isRedisConfigured()) {
  console.error(
    allowMemoryFallback()
      ? "[rateLimit] WARNING: UPSTASH_REDIS_REST_URL/TOKEN not set; RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true — limits are PER INSTANCE and weak."
      : "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set in production — sensitive endpoints will answer 503 until Redis is configured."
  );
}

export function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function unavailable(): ApiError {
  return new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "This action is temporarily unavailable. Please try again in a moment.");
}

/** express-rate-limit Store backed by Redis, with an explicit policy for "not configured" and "failing". */
export class ResilientRedisStore implements Store {
  prefix: string;
  private windowMs = 60_000;
  private readonly memory = new MemoryStore();

  constructor(private readonly name: string, private readonly critical: boolean) {
    this.prefix = `mv:rl:${name}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private useMemoryWhenUnconfigured(): boolean {
    if (!isProduction()) return true;
    return allowMemoryFallback() || !this.critical;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getRedis();
    if (!redis) {
      if (this.useMemoryWhenUnconfigured()) return this.memory.increment(key);
      throw unavailable();
    }
    const redisKey = this.prefix + key;
    try {
      const [, hits, ttl] = await redis.pipeline([
        ["SET", redisKey, 0, "PX", this.windowMs, "NX"],
        ["INCR", redisKey],
        ["PTTL", redisKey],
      ]);
      const totalHits = Number(hits);
      const ttlMs = Number(ttl);
      if (!Number.isFinite(totalHits)) throw new Error("bad INCR result");
      // A key that somehow lost its expiry would never reset; repair it.
      if (!Number.isFinite(ttlMs) || ttlMs < 0) {
        await redis.pipeline([["PEXPIRE", redisKey, this.windowMs]]);
      }
      return {
        totalHits,
        resetTime: new Date(Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : this.windowMs)),
      };
    } catch (err) {
      console.error(`[rateLimit:${this.name}] Redis error:`, (err as Error).message);
      if (this.critical) throw unavailable();
      return this.memory.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return this.memory.decrement(key);
    await redis.pipeline([["DECR", this.prefix + key]]).catch(() => {});
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return this.memory.resetKey(key);
    await redis.pipeline([["DEL", this.prefix + key]]).catch(() => {});
  }
}

function ipKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function userOrIpKey(req: Request): string {
  const userId = (req as AuthedRequest).user?.id;
  return userId ? `u:${userId}` : `ip:${ipKey(req)}`;
}

export function makeLimiter(params: {
  name: string;
  windowMs: number;
  limit: number;
  critical: boolean;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: params.windowMs,
    limit: params.limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new ResilientRedisStore(params.name, params.critical),
    keyGenerator: params.keyGenerator ?? ipKey,
    // A store error must never let the request through for critical limiters.
    passOnStoreError: !params.critical,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { error: { code: "TOO_MANY_ATTEMPTS", message: params.message } },
  });
}

/** Login, registration, PIN verification, Google sign-in, password reset (per IP). */
export const authRateLimiter = makeLimiter({
  name: "auth",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  critical: true,
  message: "Too many attempts. Please try again later.",
});

/**
 * Per-ACCOUNT limit for credential endpoints, keyed by a hash of the
 * submitted identifier — stops a distributed attack (many IPs) against
 * one account. Applied in addition to the per-IP limiter.
 */
export const accountRateLimiter = makeLimiter({
  name: "account",
  windowMs: 60 * 60 * 1000,
  limit: 20,
  critical: true,
  message: "Too many attempts for this account. Please try again later.",
  keyGenerator: (req) => {
    const raw = String((req.body && (req.body.identifier ?? req.body.email)) || "").trim().toLowerCase();
    return raw ? `id:${hashKey(raw)}` : `ip:${ipKey(req)}`;
  },
});

/** Refresh-token rotation — previously unlimited. Generous: several tabs refresh often. */
export const refreshRateLimiter = makeLimiter({
  name: "refresh",
  windowMs: 15 * 60 * 1000,
  limit: 60,
  critical: true,
  message: "Too many session refreshes. Please try again shortly.",
});

/** Verification-code / verification-link endpoints. */
export const verificationRateLimiter = makeLimiter({
  name: "verify",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  critical: true,
  message: "Too many verification requests. Please try again later.",
});

/** Money-moving actions — keyed by the AUTHENTICATED user (these run after requireAuth). */
export const financialActionRateLimiter = makeLimiter({
  name: "financial",
  windowMs: 5 * 60 * 1000,
  limit: 20,
  critical: true,
  message: "Too many requests. Please slow down and try again shortly.",
  keyGenerator: userOrIpKey,
});

/** Self-service "Test Notification" and device registration churn. */
export const notificationActionRateLimiter = makeLimiter({
  name: "notify",
  windowMs: 5 * 60 * 1000,
  limit: 20,
  critical: false,
  message: "Too many requests. Please slow down and try again shortly.",
  keyGenerator: userOrIpKey,
});

/** Admin broadcast/test-send — one call can fan out to many recipients (paid SMS). */
export const adminNotificationRateLimiter = makeLimiter({
  name: "admin-notify",
  windowMs: 10 * 60 * 1000,
  limit: 10,
  critical: true,
  message: "Too many broadcast requests. Please wait before sending another.",
  keyGenerator: userOrIpKey,
});
