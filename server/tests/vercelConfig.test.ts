import { test, describe } from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkVercelConfig, sourceToRegex, runsMoreThanDaily } = require("../scripts/checkVercelConfig.js");

const CSP_OK =
  "default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' https://accounts.google.com " +
  "https://fcm.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com; " +
  "img-src 'self' data: https://abc.supabase.co; frame-src https://accounts.google.com; worker-src 'self'";

const good = () => ({
  rewrites: [
    { source: "/api/(.*)", destination: "/api" },
    { source: "/(.*)", destination: "/web/build/index.html" },
  ],
  headers: [
    { source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: CSP_OK }, { key: "Referrer-Policy", value: "no-referrer" }] },
    { source: "/service-worker.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
  ],
  crons: [{ path: "/api/cron/meal-reminders", schedule: "0 6 * * *" }, { path: "/api/cron/reconcile", schedule: "0 3 * * *" }],
});

describe("checkVercelConfig", () => {
  test("a correct config has no errors", () => {
    const r = checkVercelConfig(good());
    assert.deepEqual(r.errors, []);
    assert.ok(r.ok.length >= 4);
  });

  test("an SPA fallback that comes BEFORE /api swallows the API (and is reported)", () => {
    const c = good();
    c.rewrites.reverse();
    const r = checkVercelConfig(c);
    assert.ok(r.errors.some((e: string) => /swallowed by the SPA fallback/.test(e)));
  });

  test("a negative-lookahead fallback is understood and passes", () => {
    const c = good();
    c.rewrites = [{ source: "/api/(.*)", destination: "/api" }, { source: "/((?!api/).*)", destination: "/web/build/index.html" }];
    assert.deepEqual(checkVercelConfig(c).errors, []);
  });

  test("no rewrites at all means email links 404", () => {
    const c = good();
    c.rewrites = [];
    assert.ok(checkVercelConfig(c).errors.some((e: string) => /404/.test(e)));
  });

  test("deep links with no fallback match are errors", () => {
    const c = good();
    c.rewrites = [{ source: "/api/(.*)", destination: "/api" }];
    const r = checkVercelConfig(c);
    assert.ok(r.errors.some((e: string) => /Deep link \/reset-password/.test(e)));
  });

  test("CSP missing any of the three Firebase hosts is an error naming the host", () => {
    for (const host of ["fcm.googleapis.com", "fcmregistrations.googleapis.com", "firebaseinstallations.googleapis.com"]) {
      const c = good();
      c.headers[0].headers[0].value = CSP_OK.replace(`https://${host}`, "");
      const r = checkVercelConfig(c);
      assert.ok(r.errors.some((e: string) => e.includes(host)), host);
    }
  });

  test("a wildcard CSP, a missing 'self', or no worker allowance are errors; missing supabase is a warning", () => {
    const wild = good();
    wild.headers[0].headers[0].value = CSP_OK.replace("img-src 'self'", "img-src * 'self'");
    assert.ok(checkVercelConfig(wild).errors.some((e: string) => /wildcard/.test(e)));
    const noWorker = good();
    noWorker.headers[0].headers[0].value = CSP_OK.replace("default-src 'self'; ", "default-src https://x.test; ").replace("script-src 'self' ", "script-src ").replace("; worker-src 'self'", "");
    assert.ok(checkVercelConfig(noWorker).errors.some((e: string) => /service workers/.test(e)));
    const noImg = good();
    noImg.headers[0].headers[0].value = CSP_OK.replace("https://abc.supabase.co", "");
    assert.ok(checkVercelConfig(noImg).warnings.some((w: string) => /supabase/.test(w)));
  });

  test("warns about a cacheable service worker and a missing Referrer-Policy", () => {
    const c = good();
    c.headers = [c.headers[0]];
    c.headers[0].headers = c.headers[0].headers.filter((h: { key: string }) => h.key !== "Referrer-Policy");
    const r = checkVercelConfig(c);
    assert.ok(r.warnings.some((w: string) => /service-worker\.js/.test(w)));
    assert.ok(r.warnings.some((w: string) => /Referrer-Policy/.test(w)));
  });

  test("cron paths must be real endpoints; sub-daily Hobby schedules and once-a-day reminders are flagged", () => {
    const c = good();
    c.crons = [{ path: "/api/cron/nope", schedule: "0 6 * * *" }, { path: "/api/cron/meal-reminders", schedule: "*/15 * * * *" }];
    const r = checkVercelConfig(c);
    assert.ok(r.errors.some((e: string) => /\/api\/cron\/nope/.test(e)));
    assert.ok(r.warnings.some((w: string) => /Hobby/.test(w)));
    const daily = checkVercelConfig(good());
    assert.ok(daily.warnings.some((w: string) => /only once a day/.test(w)));
  });

  test("helpers", () => {
    assert.equal(sourceToRegex("/api/(.*)").test("/api/x/y"), true);
    assert.equal(sourceToRegex("/:path*").test("/a/b"), true);
    assert.equal(runsMoreThanDaily("0 6 * * *"), false);
    assert.equal(runsMoreThanDaily("*/15 * * * *"), true);
    assert.equal(runsMoreThanDaily("0 */6 * * *"), true);
  });
});
