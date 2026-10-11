import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { AddressInfo } from "net";
import { createApp } from "../src/app";

/**
 * Regression tests for middleware/errorHandler.ts. Boots the real
 * Express app on an ephemeral port — no database connection is ever
 * opened because every request here is rejected before a route runs a
 * query (body parsing and auth happen first). tests/setup.ts supplies
 * the env values config/env.ts insists on.
 */

let server: http.Server;
let base: string;

async function send(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const res = await fetch(base + path, { method: init.method || "GET", headers: init.headers, body: init.body });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

describe("errorHandler", () => {
  before(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("malformed JSON body -> 400 INVALID_JSON in the standard error shape (was 500)", async () => {
    const res = await send("/api/payments/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.json, { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
  });

  test("oversized JSON body -> 413 INVALID_REQUEST_BODY", async () => {
    // express.json() default limit is 100kb.
    const res = await send("/api/payments/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(200 * 1024) }),
    });
    assert.equal(res.status, 413);
    assert.equal(res.json?.error?.code, "INVALID_REQUEST_BODY");
  });

  test("ApiError handling preserved: unauthenticated request -> 401 UNAUTHENTICATED", async () => {
    const res = await send("/api/payments/verify/MV-x");
    assert.equal(res.status, 401);
    assert.equal(res.json?.error?.code, "UNAUTHENTICATED");
  });

  test("notFoundHandler preserved: unknown route -> 404 NOT_FOUND", async () => {
    const res = await send("/api/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.json?.error?.code, "NOT_FOUND");
  });

  test("Cyzora webhook: missing signature -> 401 even with a malformed raw body (raw route bypasses JSON parser)", async () => {
    const res = await send("/api/webhooks/cyzora", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 401);
    assert.match(res.json?.error || "", /signature/i);
  });
});
