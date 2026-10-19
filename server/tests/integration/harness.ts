/**
 * Integration-test harness: REAL Postgres (throwaway, local only) + an
 * in-process mock Paystack API. No real provider is ever called, no real
 * money moves, no SMS/email is sent.
 *
 * Requires TEST_DATABASE_URL pointing at localhost/127.0.0.1 with a
 * database name containing "test" — the harness DROPS and recreates its
 * public schema. Tests are skipped when it is not set.
 */
import http from "http";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import { AddressInfo } from "net";
import { Client } from "pg";

export const TEST_DB = process.env.TEST_DATABASE_URL || "";

export function integrationEnabled(): boolean {
  if (!TEST_DB) return false;
  const u = new URL(TEST_DB);
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || TEST_DB.includes("supabase")) {
    throw new Error("Refusing: TEST_DATABASE_URL must point at localhost and never at Supabase.");
  }
  if (!u.pathname.slice(1).includes("test")) {
    throw new Error("Refusing: the TEST_DATABASE_URL database name must contain 'test' (its schema is wiped).");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Mock Paystack
// ---------------------------------------------------------------------------
export interface MockRequest {
  method: string;
  path: string;
  body: any;
}

type Behaviour = "ok" | "drop" | "500" | "400";

export class MockPaystack {
  server!: http.Server;
  port = 0;
  requests: MockRequest[] = [];
  /** reference -> what /transaction/verify returns */
  charges = new Map<string, { status: string; amountKobo: number; currency: string; reference?: string }>();
  /** transfer reference -> transfer record (created on POST /transfer unless behaviour says otherwise) */
  transfers = new Map<string, { status: string; transfer_code: string; reference: string }>();
  nextTransfer: Behaviour = "ok";
  /** status Paystack reports immediately for a new transfer */
  transferInitialStatus = "pending";
  /** when "drop", the transfer IS created but the response is lost (true unknown outcome) */
  createOnDrop = true;
  counter = 0;

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => this.handle(req, res, raw));
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.port = (this.server.address() as AddressInfo).port;
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()));
  }

  reset(): void {
    this.requests = [];
    this.charges.clear();
    this.transfers.clear();
    this.nextTransfer = "ok";
    this.transferInitialStatus = "pending";
    this.createOnDrop = true;
  }

  /** Number of requests with exactly this method and path. */
  count(method: string, exactPath: string): number {
    return this.requests.filter((r) => r.method === method && r.path === exactPath).length;
  }

  private json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse, raw: string) {
    const url = new URL(req.url || "/", "http://x");
    const body = raw ? JSON.parse(raw) : null;
    this.requests.push({ method: req.method || "", path: url.pathname, body });

    const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/);
    if (req.method === "GET" && verify) {
      const ref = decodeURIComponent(verify[1]);
      const c = this.charges.get(ref);
      if (!c) return this.json(res, 404, { status: false, message: "Transaction reference not found" });
      return this.json(res, 200, {
        status: true,
        data: { id: 9000 + this.counter++, reference: c.reference ?? ref, status: c.status, amount: c.amountKobo, currency: c.currency, paid_at: null },
      });
    }

    if (req.method === "POST" && url.pathname === "/transferrecipient") {
      return this.json(res, 201, { status: true, data: { recipient_code: `RCP_${++this.counter}` } });
    }

    if (req.method === "POST" && url.pathname === "/transfer") {
      const behaviour = this.nextTransfer;
      this.nextTransfer = "ok";
      if (behaviour === "400") return this.json(res, 400, { status: false, message: "Invalid recipient" });
      if (behaviour === "500") return this.json(res, 500, { status: false, message: "Upstream timeout" });
      const existing = this.transfers.get(body.reference);
      const record = existing ?? { status: this.transferInitialStatus, transfer_code: `TRF_${++this.counter}`, reference: body.reference };
      if (behaviour === "drop") {
        if (this.createOnDrop) this.transfers.set(body.reference, record);
        req.socket.destroy(); // response lost — the classic "did it go through?" case
        return;
      }
      if (existing) return this.json(res, 400, { status: false, message: "Duplicate Transfer Reference" });
      this.transfers.set(body.reference, record);
      return this.json(res, 200, { status: true, data: { transfer_code: record.transfer_code, status: record.status, reference: record.reference } });
    }

    const tByRef = url.pathname.match(/^\/transfer\/verify\/(.+)$/);
    if (req.method === "GET" && tByRef) {
      const t = this.transfers.get(decodeURIComponent(tByRef[1]));
      if (!t) return this.json(res, 404, { status: false, message: "Transfer not found" });
      return this.json(res, 200, { status: true, data: t });
    }
    const tByCode = url.pathname.match(/^\/transfer\/([^/]+)$/);
    if (req.method === "GET" && tByCode) {
      const code = decodeURIComponent(tByCode[1]);
      const t = [...this.transfers.values()].find((x) => x.transfer_code === code);
      if (!t) return this.json(res, 404, { status: false, message: "Transfer not found" });
      return this.json(res, 200, { status: true, data: t });
    }

    return this.json(res, 404, { status: false, message: `no mock route ${req.method} ${url.pathname}` });
  }
}

// ---------------------------------------------------------------------------
// Database reset + migrations
// ---------------------------------------------------------------------------
export async function resetDatabase(): Promise<void> {
  const c = new Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS storage CASCADE;");
  await c.query(fs.readFileSync(path.join(__dirname, "..", "support", "supabase-shim.sql"), "utf8"));
  await c.end();
  execFileSync(process.execPath, [path.join(__dirname, "..", "..", "scripts", "migrate.js")], {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: "pipe",
  });
}

/** Sets every env var config/env.ts needs BEFORE app modules are imported. */
export function configureEnv(paystackPort: number): void {
  process.env.DATABASE_URL = TEST_DB;
  process.env.NODE_ENV = "test";
  process.env.JWT_ACCESS_SECRET = "integration-test-jwt-secret";
  process.env.QR_SIGNING_SECRET = "integration-test-qr-secret";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_integration_only";
  process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${paystackPort}`;
  process.env.PAYMENT_PROVIDER_DEFAULT = "paystack";
  process.env.CRON_SECRET = "integration-cron-secret";
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.ALLOWED_ORIGINS = "http://localhost:3000";
  process.env.PAYOUT_MAX_AMOUNT_KES = "5000";
  process.env.PAYOUT_DAILY_LIMIT_KES = "1000000";
  process.env.NO_PROXY = "127.0.0.1,localhost";
  process.env.no_proxy = "127.0.0.1,localhost";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.CYZORA_SECRET_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMS_PROVIDER;
  delete process.env.FIREBASE_PRIVATE_KEY;
}

export async function listen(app: import("express").Express): Promise<{ base: string; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export async function http_(base: string, p: string, opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + p, {
    method: opts.method || "GET",
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}
