import { test, describe } from "node:test";
import { execFileSync } from "child_process";
import path from "path";
import assert from "node:assert/strict";
import { renderEmail, escapeHtml } from "../src/services/emailTemplates";
import { isResendSandboxSender } from "../src/services/emailService";
import { localSecondsOfDay } from "../src/services/mealReminderService";
import { homePathForRole } from "../src/lib/rolePaths";
import { isDeadTokenError } from "../src/services/fcmService";

describe("email templates", () => {
  test("every dynamic value is HTML-escaped (no markup injection through names, hotel names or URLs)", () => {
    const evil = `<img src=x onerror=alert(1)>"'&`;
    const { html, text } = renderEmail({
      preheader: evil,
      heading: evil,
      paragraphs: [evil],
      buttonLabel: evil,
      buttonUrl: `https://x.test/?a="><script>alert(1)</script>`,
      footnote: evil,
    });
    assert.ok(!html.includes("<img src=x"), "raw <img> must not survive");
    assert.ok(!html.includes("<script>"), "raw <script> must not survive");
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(text.includes(evil), "the plain-text part is text, not HTML");
  });

  test("is a complete, responsive, branded document with a visible fallback link and plain-text alternative", () => {
    const { html, text } = renderEmail({ preheader: "p", heading: "Hello", paragraphs: ["a", "b"], buttonLabel: "Go", buttonUrl: "https://mealvest.co.ke/x", footnote: "f" });
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /name="viewport"/);
    assert.match(html, /max-width:520px/);
    assert.match(html, /#E5482E/); // brand tomato CTA
    assert.match(html, /#1D1511/); // brand espresso header
    assert.equal((html.match(/https:\/\/mealvest\.co\.ke\/x/g) ?? []).length, 2, "button href + copy-paste fallback");
    assert.match(text, /Go: https:\/\/mealvest\.co\.ke\/x/);
  });

  test("escapeHtml covers the five dangerous characters", () => {
    assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("Resend sandbox sender detection", () => {
  test("flags only Resend's shared sender, with or without a display name", () => {
    assert.equal(isResendSandboxSender("onboarding@resend.dev"), true);
    assert.equal(isResendSandboxSender("MEALVEST <onboarding@resend.dev>"), true);
    assert.equal(isResendSandboxSender("MEALVEST <no-reply@mealvest.co.ke>"), false);
    assert.equal(isResendSandboxSender("no-reply@mealvest.co.ke"), false);
    assert.equal(isResendSandboxSender("a@resend.dev.evil.com"), false);
  });
});

describe("Firebase private key parsing (the REAL config/env.ts, as stored in a Vercel env var)", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nABC\nDEF\n-----END PRIVATE KEY-----";
  const load = (raw: string) =>
    execFileSync(process.execPath, ["--import", "tsx", "-e", 'import("./src/config/env").then(m => process.stdout.write(JSON.stringify((m.env ?? m.default.env).firebasePrivateKey)))'], {
      env: { ...process.env, FIREBASE_PRIVATE_KEY: raw },
      cwd: path.join(__dirname, ".."),
    }).toString();
  test("literal \\n sequences, surrounding quotes, and real newlines all yield the same valid PEM", () => {
    const escaped = pem.replace(/\n/g, "\\n");
    assert.equal(JSON.parse(load(escaped)), pem);
    assert.equal(JSON.parse(load(`"${escaped}"`)), pem);
    assert.equal(JSON.parse(load(pem)), pem);
  });
});

describe("Nairobi time math for reminders", () => {
  test("UTC instants map to Africa/Nairobi seconds-of-day (UTC+3, no DST)", () => {
    assert.equal(localSecondsOfDay(new Date("2026-11-03T06:10:00Z"), "Africa/Nairobi"), 9 * 3600 + 10 * 60);
    assert.equal(localSecondsOfDay(new Date("2026-11-03T21:30:00Z"), "Africa/Nairobi"), 30 * 60); // 00:30 next day
    assert.equal(localSecondsOfDay(new Date("2026-11-03T00:00:00Z"), "Africa/Nairobi"), 3 * 3600);
  });
});

describe("role home paths (notification deep links)", () => {
  test("every role lands in its own app, never a route it can't open", () => {
    assert.equal(homePathForRole("student"), "/student/home");
    assert.equal(homePathForRole("hotel_owner"), "/hotel-owner/home");
    assert.equal(homePathForRole("hotel_staff"), "/hotel-staff/home");
    assert.equal(homePathForRole("mealvest_admin"), "/admin/home");
    assert.equal(homePathForRole("whatever"), "/student/home");
  });
});

describe("FCM dead-token classification", () => {
  test("payload errors are not token errors", () => {
    assert.equal(isDeadTokenError({ status: "INVALID_ARGUMENT", message: "Invalid value at 'message.webpush.fcm_options.link'" }), false);
    assert.equal(isDeadTokenError({ status: "NOT_FOUND" }), true);
  });
});
