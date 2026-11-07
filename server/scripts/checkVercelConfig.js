#!/usr/bin/env node
/**
 * Checks a vercel.json against what the app actually needs, without deploying.
 *
 *   node scripts/checkVercelConfig.js ../vercel.json
 *
 * It verifies:
 *   1. SPA deep links (/reset-password?token=…, /verify-email, /hotel-staff/…, …) fall through to the
 *      web app's index.html, and /api/* is NEVER swallowed by that fallback (Vercel applies rewrites
 *      in order, first match wins — simulated here).
 *   2. The Content-Security-Policy still allows what the client needs for push (the three Firebase
 *      hosts), keeps 'self' for the service worker, doesn't use wildcards, and keeps the Supabase
 *      image host and Google sign-in working.
 *   3. Response headers worth having (no-cache service worker, Referrer-Policy).
 *   4. Cron definitions point at real backend endpoints, and flags schedules a Hobby plan rejects.
 *
 * Exit code 1 if any ERROR; warnings never fail it. No dependencies.
 */
const fs = require("fs");
const path = require("path");

const REQUIRED_FIREBASE_CONNECT = [
  "https://fcm.googleapis.com",
  "https://fcmregistrations.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
];
const CRON_ENDPOINTS = ["/api/cron/meal-reminders", "/api/cron/reconcile", "/api/cron/daily-payouts"];
const SPA_PROBES = ["/", "/reset-password", "/verify-email", "/login", "/student/home", "/hotel-owner/staff", "/hotel-owner/security", "/hotel-staff/home", "/hotel-staff/settings", "/admin/security"];
const API_PROBES = ["/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/verify-email/confirm", "/api/cron/meal-reminders", "/api/hotel/staff", "/api/notifications/test"];

/** Vercel (path-to-regexp) source pattern -> RegExp. Returns null if the syntax isn't one we understand. */
function sourceToRegex(source) {
  try {
    let s = source;
    if (/[{}]/.test(s.replace(/\(\?!?[^)]*\)/g, ""))) return null; // modifiers we don't model
    s = s.replace(/:([A-Za-z_][A-Za-z0-9_]*)\*/g, "(.*)").replace(/:([A-Za-z_][A-Za-z0-9_]*)\+/g, "(.+)");
    s = s.replace(/:([A-Za-z_][A-Za-z0-9_]*)(?!\()/g, "([^/]+)");
    return new RegExp("^" + s + "$");
  } catch {
    return null;
  }
}

/** First matching rewrite wins (Vercel semantics, ignoring has/missing conditions). */
function resolveRewrite(rewrites, urlPath) {
  for (const r of rewrites) {
    if (r.has || r.missing) continue;
    const re = sourceToRegex(r.source);
    if (!re) return { unknown: r.source };
    if (re.test(urlPath)) return { destination: r.destination, source: r.source };
  }
  return { destination: null };
}

function parseCsp(value) {
  const out = {};
  for (const part of String(value).split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) out[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return out;
}

function findHeader(headersRules, urlPath, name) {
  const found = [];
  for (const rule of headersRules) {
    const re = sourceToRegex(rule.source);
    if (!re || !re.test(urlPath)) continue;
    for (const h of rule.headers || []) if (h.key.toLowerCase() === name.toLowerCase()) found.push(h.value);
  }
  return found.length ? found[found.length - 1] : null;
}

/** Every cron expression field that makes it run more than once a day? (5-field cron.) */
function runsMoreThanDaily(schedule) {
  const [min, hour] = String(schedule).trim().split(/\s+/);
  const multi = (f) => f === "*" || f.includes("/") || f.includes(",") || f.includes("-");
  return multi(min) || multi(hour);
}

function checkVercelConfig(config) {
  const errors = [];
  const warnings = [];
  const ok = [];
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const headersRules = Array.isArray(config.headers) ? config.headers : [];
  const crons = Array.isArray(config.crons) ? config.crons : [];

  // ---- 1. rewrites / deep links
  if (rewrites.length === 0) {
    errors.push("No rewrites defined: opening /reset-password?token=… or /verify-email directly (as every emailed link does) would 404.");
  } else {
    let unknown = false;
    for (const p of API_PROBES) {
      const r = resolveRewrite(rewrites, p);
      if (r.unknown) { unknown = true; continue; }
      if (!r.destination) errors.push(`API route ${p} matches no rewrite — it wouldn't reach the backend.`);
      else if (/index\.html/.test(r.destination)) errors.push(`API route ${p} is swallowed by the SPA fallback (${r.source} → ${r.destination}). Put the /api rewrite BEFORE the fallback.`);
    }
    for (const p of SPA_PROBES) {
      const r = resolveRewrite(rewrites, p);
      if (r.unknown) { unknown = true; continue; }
      if (!r.destination) errors.push(`Deep link ${p} matches no rewrite: a direct open or refresh would 404 (needed for email links, notification clicks and PWA relaunches).`);
      else if (!/index\.html/.test(r.destination) && !/^\/?$/.test(r.destination)) errors.push(`Deep link ${p} is rewritten to ${r.destination}, not the web app's index.html.`);
    }
    if (unknown) warnings.push("Some rewrite `source` patterns use syntax this checker doesn't model, so those probes were skipped — verify them in a preview deployment.");
    if (!errors.some((e) => /Deep link|API route/.test(e))) ok.push("Deep links fall through to index.html and /api/* is not swallowed.");
  }

  // ---- 2. CSP
  const csp = findHeader(headersRules, "/reset-password", "Content-Security-Policy");
  if (!csp) {
    warnings.push("No Content-Security-Policy header found for page routes. (If one is set elsewhere — e.g. in a <meta> tag — make sure it permits the Firebase hosts below.)");
  } else {
    const d = parseCsp(csp);
    const connect = d["connect-src"] || d["default-src"] || [];
    for (const host of REQUIRED_FIREBASE_CONNECT) {
      if (!connect.includes(host) && !connect.includes("https:")) errors.push(`CSP connect-src is missing ${host} — push notification setup would be blocked by the browser.`);
    }
    if (REQUIRED_FIREBASE_CONNECT.every((h) => connect.includes(h))) ok.push("CSP allows the three Firebase push hosts.");
    if (!(connect.includes("'self'"))) errors.push("CSP connect-src lacks 'self' — the app couldn't call its own /api.");
    for (const dir of ["default-src", "script-src", "connect-src", "img-src", "worker-src"]) {
      const v = d[dir] || [];
      if (v.includes("*")) errors.push(`CSP ${dir} contains a bare wildcard — that defeats the policy.`);
      if (dir === "script-src" && (v.includes("https:") || v.includes("'unsafe-eval'"))) warnings.push("CSP script-src is looser than it needs to be (https: / 'unsafe-eval').");
    }
    const worker = d["worker-src"] || d["child-src"] || d["script-src"] || d["default-src"] || [];
    if (!worker.includes("'self'")) errors.push("CSP doesn't allow 'self' for service workers (worker-src/script-src/default-src) — the PWA service worker (and push) couldn't register.");
    const img = d["img-src"] || d["default-src"] || [];
    if (!img.some((x) => /supabase\.co/.test(x))) warnings.push("CSP img-src has no *.supabase.co entry — hotel/menu images stored in Supabase Storage might not display.");
    const script = (d["script-src"] || d["default-src"] || []).join(" ") + " " + connect.join(" ");
    if (!/accounts\.google\.com|apis\.google\.com|gsi/.test(script + " " + (d["frame-src"] || []).join(" "))) warnings.push("CSP doesn't mention Google sign-in hosts (accounts.google.com) — 'Continue with Google' may be blocked.");
    // Resend / Africa's Talking are called by the SERVER, never the browser: nothing to allow here.
  }

  // ---- 3. other headers
  const swCache = findHeader(headersRules, "/service-worker.js", "Cache-Control");
  if (!swCache || !/no-cache|max-age=0|no-store/.test(swCache)) warnings.push("/service-worker.js has no 'Cache-Control: no-cache' header — browsers (and the CDN) may keep serving an old service worker after a deploy.");
  else ok.push("/service-worker.js is served no-cache.");
  const ref = findHeader(headersRules, "/reset-password", "Referrer-Policy");
  if (!ref || !/no-referrer|same-origin|strict-origin/.test(ref)) warnings.push("No Referrer-Policy header on page routes — set 'no-referrer' so a reset/verify token in the URL can never leak via the Referer header.");
  else ok.push("Referrer-Policy is restrictive.");

  // ---- 4. crons
  if (crons.length === 0) warnings.push("No crons defined: nothing runs /api/cron/reconcile, /daily-payouts or /meal-reminders from Vercel.");
  for (const c of crons) {
    if (!CRON_ENDPOINTS.includes(c.path)) errors.push(`Cron path ${c.path} is not a backend endpoint (known: ${CRON_ENDPOINTS.join(", ")}).`);
    if (c.schedule && runsMoreThanDaily(c.schedule)) warnings.push(`Cron ${c.path} (${c.schedule}) runs more than once a day — the Vercel Hobby plan rejects that at deploy time. Use an external scheduler for sub-daily jobs (see docs/PRODUCTION_SETUP.md).`);
  }
  const mr = crons.find((c) => c.path === "/api/cron/meal-reminders");
  if (!mr) warnings.push("No Vercel cron for /api/cron/meal-reminders. Per-student reminder times need it called every 5–15 minutes by SOME scheduler (see docs/PRODUCTION_SETUP.md).");
  else if (!runsMoreThanDaily(mr.schedule)) warnings.push(`Meal reminders run only once a day (${mr.schedule}): students whose reminder_time isn't within ~90 minutes before that run won't be reminded that day. Add an external every-15-minutes scheduler.`);
  for (const c of crons) if (CRON_ENDPOINTS.includes(c.path)) ok.push(`Cron ${c.path} → real endpoint (${c.schedule}).`);

  return { errors, warnings, ok };
}

function main() {
  const file = path.resolve(process.argv[2] || path.join(__dirname, "../../vercel.json"));
  if (!fs.existsSync(file)) {
    console.error(`vercel.json not found at ${file}\nusage: node scripts/checkVercelConfig.js <path-to-vercel.json>`);
    process.exit(2);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`${file} is not valid JSON: ${e.message}`);
    process.exit(2);
  }
  const { errors, warnings, ok } = checkVercelConfig(config);
  for (const m of ok) console.log(`  ok    ${m}`);
  for (const m of warnings) console.log(`  WARN  ${m}`);
  for (const m of errors) console.log(`  ERROR ${m}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { checkVercelConfig, resolveRewrite, sourceToRegex, parseCsp, runsMoreThanDaily };
