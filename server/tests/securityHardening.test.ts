import { test, describe } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/jwt";
import { businessDate, dateOnly, daysBetweenDates, addDays } from "../src/lib/businessTime";
import { detectImageType, isAllowedImageUrl } from "../src/services/storageService";
import { classifyProviderSendError, PayoutSendError } from "../src/services/payoutOutcome";
import { amountsMatch } from "../src/services/paymentService";
import { sanitizeMetadata } from "../src/services/auditLog";
import { resolveDatabaseConfig } from "../src/config/db";
import { ApiError } from "../src/middleware/errorHandler";

const SECRET = process.env.JWT_ACCESS_SECRET!;
const USER = "11111111-2222-3333-4444-555555555555";

describe("L2 access-token hardening", () => {
  test("a token we sign verifies", () => {
    const t = signAccessToken({ userId: USER, role: "student" });
    assert.deepEqual(verifyAccessToken(t), { userId: USER, role: "student" });
  });

  test("alg none, other algorithms, wrong issuer/audience, missing exp, legacy tokens and bad claims are rejected", () => {
    const none = jwt.sign({ userId: USER, role: "student" }, "", { algorithm: "none" as any, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
    const hs512 = jwt.sign({ userId: USER, role: "student" }, SECRET, { algorithm: "HS512", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
    const badIss = jwt.sign({ userId: USER, role: "student" }, SECRET, { issuer: "someone-else", audience: JWT_AUDIENCE, expiresIn: "5m" });
    const badAud = jwt.sign({ userId: USER, role: "student" }, SECRET, { issuer: JWT_ISSUER, audience: "other-app", expiresIn: "5m" });
    const noExp = jwt.sign({ userId: USER, role: "student" }, SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    const legacy = jwt.sign({ userId: USER, role: "student" }, SECRET, { expiresIn: "15m" }); // pre-hardening shape
    const badRole = jwt.sign({ userId: USER, role: "superuser" }, SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
    const badSub = jwt.sign({ userId: "1 OR 1=1", role: "student" }, SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
    const expired = jwt.sign({ userId: USER, role: "student", exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    const wrongKey = jwt.sign({ userId: USER, role: "student" }, "another-secret", { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "5m" });
    for (const t of [none, hs512, badIss, badAud, noExp, legacy, badRole, badSub, expired, wrongKey, "garbage"]) {
      assert.throws(() => verifyAccessToken(t));
    }
  });
});

describe("L9 business-day boundaries (Africa/Nairobi)", () => {
  test("the Nairobi date changes at 21:00 UTC, not at UTC midnight", () => {
    assert.equal(businessDate(new Date("2026-10-15T20:59:59Z")), "2026-10-15");
    assert.equal(businessDate(new Date("2026-10-15T21:00:00Z")), "2026-10-16");
    assert.equal(businessDate(new Date("2026-12-31T21:30:00Z")), "2027-01-01");
  });
  test("an explicit DST zone is honoured (helpers are zone-generic)", () => {
    // Europe/London switches to GMT on 2026-10-25 at 01:00 UTC.
    assert.equal(businessDate(new Date("2026-10-24T23:30:00Z"), "Europe/London"), "2026-10-25");
    assert.equal(businessDate(new Date("2026-10-25T23:30:00Z"), "Europe/London"), "2026-10-25");
  });
  test("calendar arithmetic is timezone-free", () => {
    assert.equal(daysBetweenDates("2026-10-15", "2026-11-14"), 30);
    assert.equal(addDays("2026-12-30", 3), "2027-01-02");
    assert.equal(dateOnly("2026-10-15T00:00:00.000Z"), "2026-10-15");
    assert.equal(dateOnly(new Date(2026, 9, 15)), "2026-10-15"); // local-midnight Date as pg returns it
    assert.equal(dateOnly(null), null);
  });
});

describe("M7/M9 upload & URL validation", () => {
  test("images are identified by their bytes, not their claimed type", () => {
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
    assert.equal(detectImageType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)])), "image/png");
    assert.equal(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
    assert.equal(detectImageType(Buffer.from("<html><body>hi</body></html>")), null);
    assert.equal(detectImageType(Buffer.from("MZ\x90\0\x03\0\0\0\x04\0\0\0")), null);
  });
  test("hotel image URLs: https + allow-listed host only", () => {
    assert.equal(isAllowedImageUrl("https://images.unsplash.com/photo-1"), true);
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "http://images.unsplash.com/photo-1",
      "https://evil.example/pixel.gif",
      "https://images.unsplash.com.evil.example/x",
      "https://user:pass@images.unsplash.com/x",
      "not a url",
    ]) {
      assert.equal(isAllowedImageUrl(bad), false, bad);
    }
  });
});

describe("H3 provider error classification", () => {
  const axiosErr = (status?: number) =>
    Object.assign(new Error(status ? `HTTP ${status}` : "socket hang up"), {
      isAxiosError: true,
      response: status ? { status, data: { message: "x" } } : undefined,
    });
  test("only clear refusals are definite failures; timeouts/5xx/409/429 are unknown", () => {
    for (const s of [400, 401, 403, 404, 422]) assert.equal(classifyProviderSendError(axiosErr(s), "C", "f").definite, true, String(s));
    for (const s of [undefined, 409, 429, 500, 502, 503, 504]) assert.equal(classifyProviderSendError(axiosErr(s), "C", "f").definite, false, String(s));
    assert.equal(classifyProviderSendError(new Error("weird"), "C", "f").definite, false);
    assert.equal(classifyProviderSendError(new ApiError(400, "PAYOUT_BELOW_MINIMUM", "too small"), "C", "f").definite, true);
    const pre = new PayoutSendError(false, "X", "y");
    assert.equal(classifyProviderSendError(pre, "C", "f"), pre);
  });
});

describe("H1 exact amount comparison", () => {
  test("compares in cents, rejects NaN/Infinity", () => {
    assert.equal(amountsMatch(1500, 1500), true);
    assert.equal(amountsMatch(0.1 + 0.2, 0.3), true);
    assert.equal(amountsMatch(1499.99, 1500), false);
    assert.equal(amountsMatch(NaN, 1500), false);
    assert.equal(amountsMatch(Infinity, Infinity), false);
  });
});

describe("M8 audit metadata never carries secrets", () => {
  test("only allow-listed, non-sensitive scalar fields are kept", () => {
    const m = sanitizeMetadata({
      status: "rejected",
      note: "duplicate request",
      password: "hunter2",
      pin: "1234",
      ownerPassword: "x",
      refreshToken: "t",
      payment_details: { phone: "254700000000" },
      hotelId: "abc",
      nested: { a: 1 },
    });
    assert.deepEqual(m, { status: "rejected", note: "duplicate request", hotelId: "abc" });
  });
});

describe("L1 database TLS resolution", () => {
  const PEM = "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----";
  test("a configured CA enables full verification and wins over a URL sslmode", () => {
    process.env.DATABASE_CA_CERT = PEM;
    try {
      const r = resolveDatabaseConfig("postgres://u:p@db.example:6543/postgres?sslmode=require", true);
      assert.deepEqual(r.ssl && typeof r.ssl === "object" ? (r.ssl as any).rejectUnauthorized : null, true);
      assert.ok(!String(r.connectionString).includes("sslmode"));
      assert.equal(((r.ssl as any).ca as string).split("\n").length, 3);
    } finally {
      delete process.env.DATABASE_CA_CERT;
    }
  });
  test("never weaker than before: URL sslmode left to pg; production without CA can be made fatal", () => {
    assert.equal(resolveDatabaseConfig("postgres://u:p@h/db?sslmode=verify-full", true).ssl, undefined);
    process.env.DATABASE_TLS_REQUIRE_VERIFIED = "true";
    try {
      assert.throws(() => resolveDatabaseConfig("postgres://u:p@h/db", true), /DATABASE_CA_CERT/);
    } finally {
      delete process.env.DATABASE_TLS_REQUIRE_VERIFIED;
    }
  });
});
