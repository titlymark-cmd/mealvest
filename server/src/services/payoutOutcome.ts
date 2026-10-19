import axios from "axios";
import { ApiError } from "../middleware/errorHandler";

/**
 * Error thrown by a provider "send money" call, classified by what we
 * actually KNOW about the outcome (finding H3):
 *
 *   definite = true   the provider answered and clearly refused the
 *                     request (validation / auth / not-found) — no money
 *                     can have moved, so the payout may be marked failed
 *                     and its orders released.
 *   definite = false  timeout, connection reset, provider 5xx, rate
 *                     limit after retries, 409 conflict, or anything we
 *                     can't interpret. The transfer MAY have happened.
 *                     The payout must stay claimed in 'unknown' and be
 *                     reconciled under the SAME reference.
 *
 * "A timeout is not proof that a transfer failed."
 */
export class PayoutSendError extends ApiError {
  definite: boolean;
  constructor(definite: boolean, code: string, message: string) {
    super(502, code, message);
    this.definite = definite;
  }
}

/** HTTP statuses that mean "the provider understood and refused this request". */
const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 422]);

export function classifyProviderSendError(err: unknown, code: string, fallbackMessage: string): PayoutSendError {
  if (err instanceof PayoutSendError) return err;
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as { message?: unknown; error?: unknown } | undefined;
    const message =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.error === "string" && body.error) ||
      fallbackMessage;
    if (status !== undefined && DEFINITE_REJECTION_STATUSES.has(status)) {
      return new PayoutSendError(true, code, message);
    }
    // No response (timeout/network) or 5xx/409/429: outcome unknown.
    return new PayoutSendError(false, code, status ? `${message} (HTTP ${status})` : `No response from provider: ${err.message}`);
  }
  // Our own pre-flight validation (e.g. amount below the provider
  // minimum) is raised before any request is sent.
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return new PayoutSendError(true, err.code, err.message);
  }
  return new PayoutSendError(false, code, err instanceof Error ? err.message : fallbackMessage);
}
