import { NextFunction, Response } from "express";
import { PoolClient } from "pg";
import { pool } from "../config/db";
import { AuthedRequest } from "../middleware/auth";
import { runInBackground } from "../lib/background";

/**
 * Administrative audit log (finding M8). Append-only at the database
 * level (migration 049 trigger rejects UPDATE/DELETE/TRUNCATE).
 *
 * What is recorded: actor, role, action, target, outcome
 * (success / denied / failed), time, source IP and an ALLOW-LISTED set
 * of non-sensitive request fields. Passwords, PINs, tokens, keys and
 * settlement destinations are never recorded.
 */
export type AuditOutcome = "success" | "denied" | "failed";

export interface AuditEntry {
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Only these request-body fields are ever copied into the log. */
const METADATA_ALLOWLIST = new Set([
  "status",
  "hotelId",
  "note",
  "payoutReference",
  "commissionPercent",
  "loyaltyIncentivePercent",
  "title",
  "audience",
  "channel",
  "active",
  "name",
]);
const SENSITIVE_KEY = /pass|pin|token|secret|key|otp|code|details|destination|account/i;

export function sanitizeMetadata(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return out;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (!METADATA_ALLOWLIST.has(k) || SENSITIVE_KEY.test(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
  }
  return out;
}

/** Writes one audit row. Pass `client` to make it part of the caller's transaction. */
export async function recordAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, outcome, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.actorUserId,
      entry.actorRole,
      entry.action.slice(0, 200),
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.outcome,
      JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null,
    ]
  );
}

function outcomeFor(status: number): AuditOutcome {
  if (status < 400) return "success";
  if (status === 401 || status === 403) return "denied";
  return "failed";
}

/**
 * Router middleware: records every state-changing request to the admin
 * API once it finishes — successes, denied attempts (incl. non-admins
 * probing admin endpoints, because this runs BEFORE requireRole) and
 * failures. The write is registered as background work so the response
 * isn't delayed, and a logging failure is reported loudly but never
 * turns a completed financial action into an error.
 */
export function auditAdminMutations(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  // Captured now: Express resets req.baseUrl once the router has finished.
  const baseUrl = req.baseUrl;
  const rawPath = req.path;
  res.on("finish", () => {
    // Matched route pattern when available; otherwise (e.g. denied before
    // routing) the raw path with ids normalized, so actions group cleanly.
    const routePath =
      (req.route?.path as string | undefined) ??
      rawPath.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
    const params = req.params || {};
    const targetKey = Object.keys(params)[0];
    const entry: AuditEntry = {
      actorUserId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      action: `admin:${req.method} ${baseUrl}${routePath}`,
      targetType: targetKey ? targetKey.replace(/Id$/, "") : null,
      targetId: targetKey ? String(params[targetKey]).slice(0, 100) : null,
      outcome: outcomeFor(res.statusCode),
      metadata: { httpStatus: res.statusCode, ...sanitizeMetadata(req.body) },
      ip: req.ip ?? null,
    };
    runInBackground("audit-log", () =>
      recordAudit(entry).catch((err) => {
        console.error("[audit] FAILED to write audit record", { action: entry.action, error: (err as Error).message });
      })
    );
  });
  next();
}
