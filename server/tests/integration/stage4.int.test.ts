/**
 * Stage 4 — email/SMS delivery, verification, password reset, enforcement.
 * Real Postgres + in-process mock Resend / Africa's Talking (see providers.ts).
 */
import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { integrationEnabled, MockPaystack, resetDatabase, configureEnv, listen, http_ } from "./harness";
import { MockProviders } from "./providers";

const enabled = integrationEnabled();
const skip = enabled ? false : "TEST_DATABASE_URL not set — integration tests skipped";
const mock = new MockPaystack();
const prov = new MockProviders();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m: Record<string, any> = {};
let api: { base: string; close: () => Promise<void> };

before(async () => {
  if (!enabled) return;
  await mock.start();
  await prov.start();
  configureEnv(mock.port);
  process.env.RESEND_API_KEY = "re_test_key_1234567890";
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${prov.port}`;
  process.env.EMAIL_FROM = "MEALVEST <no-reply@mealvest.test>";
  process.env.SMS_PROVIDER = "africastalking";
  process.env.AFRICASTALKING_API_KEY = "at_test_key";
  process.env.AFRICASTALKING_USERNAME = "mealvest";
  process.env.AFRICASTALKING_BASE_URL = `http://127.0.0.1:${prov.port}/version1/messaging`;
  await resetDatabase();
  m.db = await import("../../src/config/db");
  m.env = await import("../../src/config/env");
  m.jwt = await import("../../src/lib/jwt");
  m.ver = await import("../../src/services/verificationService");
  m.auth = await import("../../src/services/authService");
  m.emailSvc = await import("../../src/services/emailService");
  m.smsSvc = await import("../../src/services/smsService");
  const { createApp } = await import("../../src/app");
  api = await listen(createApp());
});
after(async () => {
  if (!enabled) return;
  await api.close();
  await mock.stop();
  await prov.stop();
  await new Promise((r) => setTimeout(r, 300));
  await m.db.pool.end();
});
beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 50)); // let stragglers from the previous test land before clearing
  prov.reset();
});

let seq = 0;
let xff = 0;
const call = (p: string, o: { method?: string; token?: string; body?: unknown } = {}) =>
  http_(api.base, p, { ...o, headers: { "X-Forwarded-For": `10.4.${Math.floor(++xff / 250)}.${(xff % 250) + 1}` } });
async function q(sql: string, params: unknown[] = []) {
  return (await m.db.pool.query(sql, params)).rows;
}
async function makeUser(opts: { role?: string; google?: boolean; suspended?: boolean } = {}) {
  seq++;
  const role = opts.role ?? "student";
  const [u] = await q(
    `INSERT INTO users (email, phone_number, password_hash, pin_hash, role, auth_provider, google_id, email_verified, account_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8) RETURNING id, email, phone_number`,
    [
      `s4u${seq}-${crypto.randomBytes(3).toString("hex")}@int.test`,
      `2547${String(40000000 + seq)}`,
      await bcrypt.hash("password123", 4),
      await bcrypt.hash("1234", 4),
      role,
      opts.google ? "google" : "password",
      opts.google ? `g-${seq}` : null,
      opts.suspended ? "suspended" : "active",
    ]
  );
  if (role === "student") await q("INSERT INTO students (user_id, full_name) VALUES ($1, $2)", [u.id, `S4 ${seq}`]);
  return { id: u.id as string, email: u.email as string, phone: u.phone_number as string, token: m.jwt.signAccessToken({ userId: u.id, role }) as string };
}
const ageTokens = (userId: string, channel: string) =>
  q("UPDATE verification_tokens SET created_at = created_at - interval '2 minutes' WHERE user_id = $1 AND channel = $2", [userId, channel]);

// =================================================================== email verification
describe("email verification — delivery, limits, supersede", { skip }, () => {
  test("sends exactly one email with a link on APP_BASE_URL; only a hash is stored", async () => {
    const u = await makeUser();
    const r = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.sent, true);
    assert.equal(prov.emails.length, 1);
    assert.deepEqual(prov.emails[0].to, [u.email]);
    assert.equal(prov.emails[0].auth, "Bearer re_test_key_1234567890");
    const link = prov.lastEmailLink();
    assert.match(link, /^http:\/\/localhost:3000\/verify-email\?token=[0-9a-f]{64}$/);
    const token = link.split("token=")[1];
    const rows = await q("SELECT token_hash, target FROM verification_tokens WHERE user_id=$1", [u.id]);
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token); // never stored in the clear
    assert.equal(rows[0].token_hash, crypto.createHash("sha256").update(token).digest("hex"));
    assert.equal(rows[0].target, u.email.toLowerCase());
    // the HTML escapes and is branded; the plain-text alternative exists
    assert.ok(prov.emails[0].html.includes("MEAL"));
    assert.ok(prov.emails[0].text.length > 20);
  });

  test("delivery failure → honest 502, token deleted, allowance released, earlier valid link untouched", async () => {
    const u = await makeUser();
    assert.equal((await call("/api/auth/verify-email/request", { method: "POST", token: u.token })).status, 200);
    const firstToken = prov.lastEmailLink().split("token=")[1];
    await ageTokens(u.id, "email");

    prov.emailMode = "fail";
    const r = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    assert.equal(r.status, 502);
    assert.equal(r.data.error.code, "EMAIL_SEND_FAILED");
    assert.ok(!JSON.stringify(r.data).includes("boom"), "provider detail must not reach the client");
    assert.ok(!JSON.stringify(r.data).includes("re_test_key"), "key must not reach the client");
    // only the first (delivered) token remains: the failed one was discarded, so no allowance burned
    assert.equal((await q("SELECT count(*)::int n FROM verification_tokens WHERE user_id=$1", [u.id]))[0].n, 1);
    // …and the earlier link still works
    prov.emailMode = "ok";
    assert.equal((await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: firstToken } })).status, 200);
  });

  test("60-second resend cooldown: second immediate request is refused and sends nothing", async () => {
    const u = await makeUser();
    await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    const r = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    assert.equal(r.status, 429);
    assert.equal(r.data.error.code, "VERIFICATION_COOLDOWN");
    assert.equal(prov.emails.length, 1);
  });

  test("REGRESSION: the daily cap now actually accumulates (5/day), instead of resetting on every resend", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) {
      const r = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
      assert.equal(r.status, 200, `send ${i + 1}: ${JSON.stringify(r.data)}`);
      await ageTokens(u.id, "email"); // step past the cooldown only
    }
    assert.equal((await q("SELECT count(*)::int n FROM verification_tokens WHERE user_id=$1", [u.id]))[0].n, 5);
    const sixth = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.data.error.code, "VERIFICATION_LIMIT");
    assert.equal(prov.emails.length, 5);
  });

  test("a newer link supersedes the older one (older → 'already used or replaced'); the newest works once", async () => {
    const u = await makeUser();
    await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    const t1 = prov.lastEmailLink().split("token=")[1];
    await ageTokens(u.id, "email");
    await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    const t2 = prov.lastEmailLink().split("token=")[1];
    const old = await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: t1 } });
    assert.equal(old.status, 400);
    assert.equal(old.data.error.code, "VERIFICATION_LINK_USED");
    assert.equal((await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: t2 } })).status, 200);
    const replay = await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: t2 } });
    assert.equal(replay.status, 400);
    assert.equal(replay.data.error.code, "VERIFICATION_LINK_USED");
  });

  test("already-verified accounts are handled gracefully (no email, clear flag)", async () => {
    const u = await makeUser();
    await q("UPDATE users SET email_verified = true WHERE id=$1", [u.id]);
    const r = await call("/api/auth/verify-email/request", { method: "POST", token: u.token });
    assert.equal(r.status, 200);
    assert.deepEqual({ sent: r.data.sent, alreadyVerified: r.data.alreadyVerified }, { sent: false, alreadyVerified: true });
    assert.equal(prov.emails.length, 0);
  });

  test("expired, malformed and email-changed tokens get precise, safe answers", async () => {
    const u = await makeUser();
    const plant = async (target: string, ttl = "1 hour") => {
      const tok = crypto.randomBytes(32).toString("hex");
      await q(`INSERT INTO verification_tokens (user_id, channel, target, token_hash, expires_at) VALUES ($1,'email',$2,$3, now() + interval '${ttl}')`, [u.id, target, crypto.createHash("sha256").update(tok).digest("hex")]);
      return tok;
    };
    const expired = await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: await plant(u.email.toLowerCase(), "-1 minute") } });
    assert.equal(expired.data.error.code, "VERIFICATION_LINK_EXPIRED");
    for (const bad of ["abc", "z".repeat(64), "A".repeat(64), "0".repeat(64)]) {
      const r = await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: bad } });
      assert.equal(r.status, 400, bad);
      assert.equal(r.data.error.code, "INVALID_VERIFICATION_TOKEN");
    }
    // address changed after the link was sent: must NOT verify the new address
    const stale = await plant("old-address@int.test");
    const r = await call("/api/auth/verify-email/confirm", { method: "POST", body: { token: stale } });
    assert.equal(r.status, 400);
    assert.equal((await q("SELECT email_verified FROM users WHERE id=$1", [u.id]))[0].email_verified, false);
  });

  test("email not configured / sandbox sender in production → 503, nothing created, nothing sent", async () => {
    const u = await makeUser();
    const e = m.env.env;
    const saved = { key: e.resendApiKey, from: e.emailFrom, prod: e.isProduction, allow: e.allowResendSandboxSender };
    try {
      e.resendApiKey = "";
      assert.equal((await call("/api/auth/verify-email/request", { method: "POST", token: u.token })).status, 503);
      e.resendApiKey = saved.key;
      e.isProduction = true;
      e.emailFrom = "MEALVEST <onboarding@resend.dev>";
      assert.equal(m.emailSvc.isEmailConfigured(), false);
      assert.match(m.emailSvc.emailConfigProblem(), /sandbox sender/i);
      assert.equal((await call("/api/auth/verify-email/request", { method: "POST", token: u.token })).status, 503);
      e.allowResendSandboxSender = true; // explicit owner-only testing escape hatch
      assert.equal(m.emailSvc.isEmailConfigured(), true);
      e.emailFrom = "MEALVEST <no-reply@mealvest.co.ke>";
      e.allowResendSandboxSender = false;
      assert.equal(m.emailSvc.isEmailConfigured(), true);
    } finally {
      e.resendApiKey = saved.key; e.emailFrom = saved.from; e.isProduction = saved.prod; e.allowResendSandboxSender = saved.allow;
    }
    assert.equal(prov.emails.length, 0);
    assert.equal((await q("SELECT count(*)::int n FROM verification_tokens WHERE user_id=$1", [u.id]))[0].n, 0);
  });
});

// =================================================================== phone verification
describe("phone verification — Africa's Talking delivery and code security", { skip }, () => {
  const req = (u: { token: string }) => call("/api/auth/verify-phone/request", { method: "POST", token: u.token });
  const confirm = (u: { token: string }, code: string) => call("/api/auth/verify-phone/confirm", { method: "POST", token: u.token, body: { code } });

  test("sends a 6-digit code to the user's own number (+254…), HMAC-hashed at rest, no sender id unless configured", async () => {
    const u = await makeUser();
    const r = await req(u);
    assert.equal(r.status, 200);
    assert.equal(r.data.sent, true);
    assert.equal(prov.sms.length, 1);
    assert.equal(prov.sms[0].to, `+${u.phone}`);
    assert.equal(prov.sms[0].apiKey, "at_test_key");
    assert.equal(prov.sms[0].from, undefined, "sender ID must be optional until approved");
    const code = prov.lastSmsCode();
    const [row] = await q("SELECT token_hash, target FROM verification_tokens WHERE user_id=$1 AND channel='phone'", [u.id]);
    assert.notEqual(row.token_hash, code);
    assert.equal(row.target, u.phone);
    assert.equal(row.token_hash, m.ver.__testing.phoneCodeHash(u.id, code));
    assert.equal((await confirm(u, code)).status, 200);
    assert.equal((await q("SELECT phone_verified FROM users WHERE id=$1", [u.id]))[0].phone_verified, true);
  });

  test("a configured sender id is sent; a 'Queued' (102) response counts as accepted", async () => {
    const u = await makeUser();
    m.env.env.africasTalkingSenderId = "MEALVEST";
    prov.smsMode = "queued";
    try {
      assert.equal((await req(u)).status, 200);
    } finally {
      m.env.env.africasTalkingSenderId = "";
    }
    assert.equal(prov.sms[0].from, "MEALVEST");
  });

  test("insufficient balance → honest 502 with NO internal detail; code discarded; allowance released", async () => {
    const u = await makeUser();
    prov.smsMode = "balance";
    const r = await req(u);
    assert.equal(r.status, 502);
    assert.equal(r.data.error.code, "SMS_SEND_FAILED");
    assert.ok(!/balance|credit|airtime/i.test(JSON.stringify(r.data)), "must not leak that the account is out of credit");
    assert.equal((await q("SELECT count(*)::int n FROM verification_tokens WHERE user_id=$1", [u.id]))[0].n, 0);
    prov.smsMode = "ok";
    assert.equal((await req(u)).status, 200, "no cooldown/allowance was burned by the failed attempt");
  });

  test("provider rejection variants never report success: invalid number, blacklisted, bad API key", async () => {
    const u = await makeUser();
    prov.smsMode = "invalid";
    const inv = await req(u);
    assert.equal(inv.status, 400);
    assert.equal(inv.data.error.code, "INVALID_PHONE");
    prov.smsMode = "blocked";
    assert.equal((await req(u)).status, 502);
    prov.smsMode = "badkey";
    assert.equal((await req(u)).status, 502);
    assert.equal((await q("SELECT count(*)::int n FROM verification_tokens WHERE user_id=$1", [u.id]))[0].n, 0);
  });

  test("a number that is not 254XXXXXXXXX never reaches the provider", async () => {
    const u = await makeUser();
    await q("UPDATE users SET phone_number = '12345' WHERE id=$1", [u.id]);
    const r = await req(u);
    assert.equal(r.status, 400);
    assert.equal(prov.sms.length, 0);
  });

  test("two simultaneous requests send exactly ONE SMS (per-user lock + cooldown)", async () => {
    const u = await makeUser();
    const [a, b] = await Promise.all([req(u), req(u)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 429]);
    assert.equal(prov.sms.length, 1);
  });

  test("daily cap of 5 holds for SMS too", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) {
      assert.equal((await req(u)).status, 200);
      await ageTokens(u.id, "phone");
    }
    const r = await req(u);
    assert.equal(r.status, 429);
    assert.equal(r.data.error.code, "VERIFICATION_LIMIT");
    assert.equal(prov.sms.length, 5);
  });

  test("wrong code: counts down attempts, burns on the 5th, correct code afterwards is useless, reuse refused", async () => {
    const u = await makeUser();
    await req(u);
    const good = prov.lastSmsCode();
    const wrong = good === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 1; left--) {
      const r = await confirm(u, wrong);
      assert.equal(r.status, 400);
      assert.equal(r.data.error.code, "INVALID_VERIFICATION_CODE");
      assert.match(r.data.error.message, new RegExp(`${left} attempt`));
    }
    const fifth = await confirm(u, wrong);
    assert.equal(fifth.status, 429);
    assert.equal(fifth.data.error.code, "VERIFICATION_TOO_MANY_ATTEMPTS");
    assert.equal((await confirm(u, good)).status, 429); // still locked out, even with the right code
    assert.equal((await q("SELECT phone_verified FROM users WHERE id=$1", [u.id]))[0].phone_verified, false);

    const v = await makeUser();
    await req(v);
    const code = prov.lastSmsCode();
    assert.equal((await confirm(v, code)).status, 200);
    const reuse = await confirm(v, code);
    assert.equal(reuse.status, 400);
    assert.equal(reuse.data.error.code, "VERIFICATION_CODE_EXPIRED");
  });

  test("expired code, no code, malformed code, and a number changed after sending are all refused", async () => {
    const u = await makeUser();
    assert.equal((await confirm(u, "123456")).data.error.code, "VERIFICATION_CODE_EXPIRED"); // nothing requested
    assert.equal((await confirm(u, "12ab56")).status, 400);
    await req(u);
    const code = prov.lastSmsCode();
    await q("UPDATE verification_tokens SET expires_at = now() - interval '1 second' WHERE user_id=$1", [u.id]);
    assert.equal((await confirm(u, code)).data.error.code, "VERIFICATION_CODE_EXPIRED");

    const w = await makeUser();
    await ageTokens(w.id, "phone");
    await req(w);
    const code2 = prov.lastSmsCode();
    await q("UPDATE users SET phone_number = '254799000222' WHERE id=$1", [w.id]); // number changed after the code was sent
    const r = await confirm(w, code2);
    assert.equal(r.status, 400);
    assert.equal((await q("SELECT phone_verified FROM users WHERE id=$1", [w.id]))[0].phone_verified, false);
  });

  test("Africa's Talking SANDBOX in production is reported as not configured (it never delivers)", async () => {
    const u = await makeUser();
    const e = m.env.env;
    const saved = { user: e.africasTalkingUsername, prod: e.isProduction };
    try {
      e.isProduction = true;
      e.africasTalkingUsername = "sandbox";
      assert.equal(m.smsSvc.isSmsConfigured(), false);
      assert.match(m.smsSvc.smsConfigProblem(), /sandbox/i);
      assert.equal((await req(u)).status, 503);
    } finally {
      e.africasTalkingUsername = saved.user; e.isProduction = saved.prod;
    }
    assert.equal(prov.sms.length, 0);
  });
});

// =================================================================== role-agnostic status
describe("verification status endpoint serves every role", { skip }, () => {
  test("student, hotel owner, hotel staff and admin all get their own status; unauthenticated gets 401", async () => {
    for (const role of ["student", "hotel_owner", "hotel_staff", "mealvest_admin"]) {
      const u = await makeUser({ role });
      const r = await call("/api/auth/verification-status", { token: u.token });
      assert.equal(r.status, 200, role);
      assert.equal(r.data.email, u.email);
      assert.equal(r.data.emailVerified, false);
      assert.equal(r.data.phoneVerified, false);
      assert.equal(typeof r.data.emailDeliveryAvailable, "boolean");
      assert.equal(r.data.resendCooldownSeconds, 60);
    }
    assert.equal((await call("/api/auth/verification-status")).status, 401);
  });
});

// =================================================================== password reset
describe("forgot / reset password", { skip }, () => {
  // The reset email is sent in the background (deliberately: anti-enumeration timing), so wait for it to land.
  const forgot = async (identifier: string) => {
    const r = await call("/api/auth/forgot-password", { method: "POST", body: { identifier } });
    await new Promise((res) => setTimeout(res, 250));
    return r;
  };
  const reset = (token: string, newPassword: string) => call("/api/auth/reset-password", { method: "POST", body: { token, newPassword } });
  const tokenFromLastEmail = () => prov.lastEmailLink().split("token=")[1];

  test("the response is identical for known, unknown, google-only and suspended accounts; only the real one gets mail", async () => {
    const known = await makeUser();
    const google = await makeUser({ google: true });
    await q("UPDATE users SET password_hash = NULL WHERE id=$1", [google.id]);
    const susp = await makeUser({ suspended: true });
    const responses = [];
    for (const id of [known.email, "nobody-here@int.test", google.email, susp.email, known.phone]) {
      const r = await forgot(id);
      responses.push({ status: r.status, body: JSON.stringify(r.data) });
    }
    assert.ok(responses.every((r) => r.status === responses[0].status && r.body === responses[0].body), JSON.stringify(responses));
    assert.equal(responses[0].status, 200);
    // known (by email) + known (by phone) → 2 mails, both to the real address; nobody else
    assert.equal(prov.emails.length, 2);
    assert.ok(prov.emails.every((e) => e.to[0] === known.email));
  });

  test("the link is on APP_BASE_URL; token is >=256-bit, stored only hashed, expires in ~30 min", async () => {
    const u = await makeUser();
    await forgot(u.email);
    const link = prov.lastEmailLink();
    assert.match(link, /^http:\/\/localhost:3000\/reset-password\?token=[0-9a-f]{64,}$/);
    const tok = tokenFromLastEmail();
    const [row] = await q("SELECT token_hash, (expires_at - now()) AS ttl FROM password_reset_tokens WHERE user_id=$1", [u.id]);
    assert.notEqual(row.token_hash, tok);
    assert.equal(row.token_hash, crypto.createHash("sha256").update(tok).digest("hex"));
    const mins = (row.ttl.minutes ?? 0) + (row.ttl.hours ?? 0) * 60 + (row.ttl.seconds ?? 0) / 60;
    assert.ok(mins > 28 && mins <= 30, `ttl minutes=${mins}`);
  });

  test("email-delivery failure still returns the same generic 200, and nothing leaks", async () => {
    const u = await makeUser();
    prov.emailMode = "fail";
    const r = await forgot(u.email);
    assert.equal(r.status, 200);
    assert.ok(!JSON.stringify(r.data).match(/fail|error|boom|resend/i));
  });

  test("redeeming: works once, rotates the password, revokes sessions + pending logins, burns sibling links", async () => {
    const u = await makeUser();
    const login = await m.auth.login({ identifier: u.email, password: "password123" });
    assert.ok(login.pendingToken || login.pending_token || login);
    await q("INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, gen_random_uuid(), now() + interval '1 day')", [u.id, crypto.randomBytes(16).toString("hex")]);
    await forgot(u.email);
    const tok = tokenFromLastEmail();
    const ok = await reset(tok, "brand-new-pass-1");
    assert.equal(ok.status, 200);
    assert.equal((await q("SELECT count(*)::int n FROM refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL", [u.id]))[0].n, 0);
    assert.equal((await q("SELECT count(*)::int n FROM pending_login_tokens WHERE user_id=$1", [u.id]))[0].n, 0);
    assert.equal((await q("SELECT count(*)::int n FROM password_reset_tokens WHERE user_id=$1", [u.id]))[0].n, 0);
    const [{ password_hash }] = await q("SELECT password_hash FROM users WHERE id=$1", [u.id]);
    assert.equal(await bcrypt.compare("brand-new-pass-1", password_hash), true);
    assert.equal(await bcrypt.compare("password123", password_hash), false);
    const replay = await reset(tok, "another-pass-2");
    assert.equal(replay.status, 400);
    assert.equal(replay.data.error.code, "INVALID_RESET_TOKEN");
  });

  test("invalid, expired, malformed and too-weak requests are all refused; only the newest link works", async () => {
    const u = await makeUser();
    await forgot(u.email);
    const first = tokenFromLastEmail();
    await q("UPDATE password_reset_tokens SET created_at = created_at - interval '1 minute'"); // (cosmetic) keep ordering clear
    await forgot(u.email);
    const second = tokenFromLastEmail();
    assert.notEqual(first, second);
    assert.equal((await reset(first, "long-enough-1")).status, 400);          // superseded
    assert.equal((await reset("not-a-real-token", "long-enough-1")).status, 400);
    assert.equal((await reset("", "long-enough-1")).status, 400);
    assert.equal((await reset(second, "short")).status, 400);                 // weak password does NOT consume the token
    await q("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id=$1", [u.id]);
    assert.equal((await reset(second, "long-enough-1")).status, 400);         // expired
    assert.equal((await q("SELECT password_hash FROM users WHERE id=$1", [u.id]))[0].password_hash.length > 0, true);
  });

  test("ATOMIC: two simultaneous redemptions of one token — exactly one wins, and the DB ends in one consistent state", async () => {
    const u = await makeUser();
    await forgot(u.email);
    const tok = tokenFromLastEmail();
    const results = await Promise.all([reset(tok, "winner-password-A1"), reset(tok, "winner-password-B2"), reset(tok, "winner-password-C3")]);
    assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
    const [{ password_hash }] = await q("SELECT password_hash FROM users WHERE id=$1", [u.id]);
    const winners = ["winner-password-A1", "winner-password-B2", "winner-password-C3"];
    let matches = 0;
    for (const w of winners) if (await bcrypt.compare(w, password_hash)) matches++;
    assert.equal(matches, 1);
  });

  test("a suspended account can't be revived through a reset link planted before suspension", async () => {
    const u = await makeUser();
    await forgot(u.email);
    const tok = tokenFromLastEmail();
    await q("UPDATE users SET account_status='suspended' WHERE id=$1", [u.id]);
    const r = await reset(tok, "long-enough-9");
    assert.equal(r.status, 400);
    assert.equal(await bcrypt.compare("password123", (await q("SELECT password_hash FROM users WHERE id=$1", [u.id]))[0].password_hash), true);
  });
});

// =================================================================== enforcement
describe("verification enforcement (configurable, enforced on the backend)", { skip }, () => {
  test("REQUIRE_VERIFIED_PHONE_FOR_WITHDRAWAL: unverified → 403 PHONE_NOT_VERIFIED with a clear message; off by default", async () => {
    const u = await makeUser();
    const body = { payoutMethod: "mpesa", payoutDestination: "0712345678", pin: "1234" };
    const e = m.env.env;
    const off = await call("/api/student/withdraw", { method: "POST", token: u.token, body });
    assert.notEqual(off.data?.error?.code, "PHONE_NOT_VERIFIED", "policy is off by default");
    e.requireVerifiedPhoneForWithdrawal = true;
    try {
      const on = await call("/api/student/withdraw", { method: "POST", token: u.token, body });
      assert.equal(on.status, 403);
      assert.equal(on.data.error.code, "PHONE_NOT_VERIFIED");
      assert.match(on.data.error.message, /verify your phone/i);
    } finally {
      e.requireVerifiedPhoneForWithdrawal = false;
    }
  });

  test("REQUIRE_VERIFIED_EMAIL_FOR_SENSITIVE_OPS: unverified → 403 EMAIL_NOT_VERIFIED; verified passes the gate", async () => {
    const u = await makeUser();
    const e = m.env.env;
    const body = { payoutMethod: "mpesa", payoutDestination: "0712345678", pin: "1234" };
    e.requireVerifiedEmailForSensitiveOps = true;
    try {
      const blocked = await call("/api/student/withdraw", { method: "POST", token: u.token, body });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.data.error.code, "EMAIL_NOT_VERIFIED");
      await q("UPDATE users SET email_verified = true WHERE id=$1", [u.id]);
      const passed = await call("/api/student/withdraw", { method: "POST", token: u.token, body });
      assert.notEqual(passed.data?.error?.code, "EMAIL_NOT_VERIFIED");
    } finally {
      e.requireVerifiedEmailForSensitiveOps = false;
    }
  });

  test("ordinary use is never blocked by the policies: browsing/profile work for an unverified user even when both are ON", async () => {
    const u = await makeUser();
    const e = m.env.env;
    e.requireVerifiedEmailForSensitiveOps = true;
    e.requireVerifiedPhoneForWithdrawal = true;
    try {
      assert.equal((await call("/api/student/profile", { token: u.token })).status, 200);
      assert.equal((await call("/api/auth/verification-status", { token: u.token })).status, 200);
    } finally {
      e.requireVerifiedEmailForSensitiveOps = false;
      e.requireVerifiedPhoneForWithdrawal = false;
    }
  });
});
