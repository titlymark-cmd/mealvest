import axios, { AxiosError, AxiosInstance } from "axios";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

/**
 * The one HTTP client every Cyzora call goes through (payments in
 * cyzoraProvider.ts, payouts in cyzoraPayoutService.ts) — mirrors the
 * hand-rolled axios-client convention used for Paystack, Supabase
 * Storage, Africa's Talking, etc. in this codebase rather than an SDK.
 *
 * What it centralises, per Cyzora's API contract:
 *   - Base URL https://api.cyzora.co.ke/api/v1, JSON in / JSON out.
 *   - Auth: the SECRET key in `X-API-Key`. Server-side only — this
 *     module must never be imported by anything that ships to a
 *     browser (it can't be: it lives under server/).
 *   - `Idempotency-Key` on every POST that creates a charge, checkout
 *     session or payout, so a network retry can never charge or pay
 *     twice. Callers pass our own unique reference (MV-… / PO-…).
 *   - Errors come back as `{ "error": "message" }` with 400/401/403/
 *     404/409/410/422/429 — mapped to this codebase's ApiError shape
 *     with a message that's safe to show, and 429 is retried with
 *     backoff (safe precisely BECAUSE every creating POST carries an
 *     Idempotency-Key).
 */

const RETRY_DELAYS_MS = [1000, 2000, 4000];

function requireConfigured(): void {
  if (!env.cyzoraSecretKey) {
    throw new ApiError(
      500,
      "CYZORA_NOT_CONFIGURED",
      "Cyzora is not configured on this server yet. Set CYZORA_SECRET_KEY in .env."
    );
  }
}

export function isCyzoraConfigured(): boolean {
  return Boolean(env.cyzoraSecretKey);
}

export function isCyzoraTestMode(): boolean {
  return env.cyzoraSecretKey.startsWith("sk_test_");
}

function instance(): AxiosInstance {
  requireConfigured();
  return axios.create({
    baseURL: env.cyzoraBaseUrl,
    headers: {
      "X-API-Key": env.cyzoraSecretKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30_000,
  });
}

/** Pulls Cyzora's `{ "error": "message" }` body out of an axios error, falling back to a generic line. */
export function cyzoraErrorMessage(err: AxiosError, fallback: string): string {
  const body = err.response?.data as { error?: unknown; message?: unknown } | undefined;
  if (body && typeof body.error === "string" && body.error.trim()) return body.error;
  if (body && typeof body.message === "string" && body.message.trim()) return body.message;
  return fallback;
}

/**
 * Maps a Cyzora HTTP failure to the ApiError this API returns to its
 * own clients. Status choice: a 4xx that's about OUR request (bad
 * field, unknown id, duplicate, expired session) is passed through so
 * the frontend can show Cyzora's own clear message; 401/403 mean the
 * server's key is wrong/not permitted, which is a configuration
 * problem to surface as 500 without echoing anything key-related;
 * 429 after our retries, and any 5xx/network error, are 502/503 —
 * Cyzora's problem, retry later.
 */
export function mapCyzoraError(err: unknown, context: string, fallback: string): ApiError {
  if (!axios.isAxiosError(err)) {
    return err instanceof ApiError ? err : new ApiError(502, "CYZORA_REQUEST_FAILED", fallback);
  }
  const status = err.response?.status;
  const message = cyzoraErrorMessage(err, fallback);

  // Log Cyzora's own response body server-side only (it's their error
  // text, never our key) so a failed call never needs guessing at.
  console.error(`[cyzora.${context}] Cyzora request failed:`, { status, body: err.response?.data ?? err.message });

  switch (status) {
    case 400:
    case 422:
      return new ApiError(400, "CYZORA_REJECTED", message);
    case 401:
    case 403:
      return new ApiError(500, "CYZORA_AUTH_FAILED", "Cyzora rejected this server's API key. Check CYZORA_SECRET_KEY.");
    case 404:
      return new ApiError(404, "CYZORA_NOT_FOUND", message);
    case 409:
      return new ApiError(409, "CYZORA_CONFLICT", message);
    case 410:
      return new ApiError(410, "CYZORA_EXPIRED", message);
    case 429:
      return new ApiError(503, "CYZORA_RATE_LIMITED", "Cyzora is busy right now. Please try again in a moment.");
    default:
      return new ApiError(502, "CYZORA_REQUEST_FAILED", fallback);
  }
}

function retryAfterMs(err: AxiosError, attempt: number): number {
  const header = err.response?.headers?.["retry-after"];
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 15_000);
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimited = axios.isAxiosError(err) && err.response?.status === 429;
      if (!isRateLimited || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(retryAfterMs(err as AxiosError, attempt));
    }
  }
}

/** GET {baseURL}{path} — path segments must already be encodeURIComponent'd by the caller. */
export async function cyzoraGet<T = any>(path: string, params?: Record<string, string | number>): Promise<T> {
  const client = instance();
  const res = await withRateLimitRetry(() => client.get(path, { params }));
  return res.data as T;
}

/**
 * POST with the mandatory Idempotency-Key. `idempotencyKey` is OUR
 * reference for the thing being created (transactions.provider_reference
 * or hotel_payouts.transfer_reference) — unique per row in our DB, so
 * replaying the same key is exactly the "retry, don't duplicate"
 * semantics Cyzora provides.
 */
export async function cyzoraPost<T = any>(path: string, body: Record<string, unknown>, idempotencyKey: string): Promise<T> {
  if (!idempotencyKey) throw new Error("cyzoraPost: idempotencyKey is required for every creating POST.");
  const client = instance();
  const res = await withRateLimitRetry(() =>
    client.post(path, body, { headers: { "Idempotency-Key": idempotencyKey } })
  );
  return res.data as T;
}

/**
 * Cyzora amounts are integers in CENTS: KES 1,500 is 150000. This
 * codebase works in whole KSh everywhere else (transactions.amount,
 * budgets, API responses), so the conversion happens ONLY at this
 * boundary — same pattern as the Paystack adapter. Rounds to the
 * nearest cent first so a KSh 174.46 hotel_amount becomes 17446, never
 * a float.
 */
export function kesToCents(amountKes: number): number {
  const cents = Math.round(Number(amountKes) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new ApiError(400, "INVALID_AMOUNT", "Amount must be a positive number of shillings.");
  }
  return cents;
}

export function centsToKes(cents: unknown): number {
  const n = Number(cents);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n) / 100;
}
