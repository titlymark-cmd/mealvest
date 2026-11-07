import { env } from "../config/env";
import { emailConfigProblem } from "../services/emailService";
import { smsConfigProblem, smsEnvironment } from "../services/smsService";
import { isPushConfigured } from "../services/fcmService";

let logged = false;

/**
 * One boot-time summary of which outbound integrations can actually deliver, so a
 * misconfigured deployment is visible in the Vercel function logs on the first cold
 * start instead of surfacing later as "users say they never got the email". Secrets
 * are never printed — only whether each piece is ready, and why not.
 */
export function logIntegrationStatusOnce(): void {
  if (logged || env.nodeEnv === "test") return;
  logged = true;
  const email = emailConfigProblem();
  const sms = smsConfigProblem();
  console.log(`[integrations] email: ${email ? `NOT READY — ${email}` : "ready"}`);
  console.log(`[integrations] sms:   ${sms ? `NOT READY — ${sms}` : `ready (${smsEnvironment()})`}`);
  console.log(`[integrations] push:  ${isPushConfigured() ? "server credentials present" : "NOT READY — FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not all set"}`);
  console.log(`[integrations] cron:  ${env.cronSecret ? "CRON_SECRET set" : "NOT READY — CRON_SECRET is not set (cron endpoints refuse every call)"}`);
}
