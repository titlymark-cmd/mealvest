import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { SmsProvider, SendSmsParams, SendSmsResult } from "./smsProvider";
import { AfricasTalkingSmsProvider, isAfricasTalkingSandbox } from "./africasTalkingSms";

/**
 * Selects the configured SMS provider by SMS_PROVIDER. Throws a clear
 * error if unset or unrecognized, rather than silently no-opping —
 * matching storageService/emailService's own "not configured yet"
 * pattern. notificationService catches this and logs a 'skipped'
 * delivery row rather than letting it propagate (see there).
 */
function provider(): SmsProvider {
  const problem = smsConfigProblem();
  if (problem) throw new ApiError(503, "SMS_NOT_CONFIGURED", "SMS is not available right now.");
  return new AfricasTalkingSmsProvider();
}

/**
 * Why SMS can't be sent right now, or null if it can.
 * The Africa's Talking sandbox ("sandbox" username) accepts requests but never
 * reaches a real handset, so in production it is reported as NOT configured —
 * otherwise users would be told a code was sent when nothing arrived.
 */
export function smsConfigProblem(): string | null {
  if (env.smsProvider !== "africastalking") return "SMS_PROVIDER is not set to 'africastalking'.";
  if (!env.africasTalkingApiKey || !env.africasTalkingUsername) {
    return "AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME must both be set.";
  }
  if (env.isProduction && isAfricasTalkingSandbox()) {
    return "AFRICASTALKING_USERNAME is 'sandbox' — the sandbox never delivers real SMS. Use your live app's username and API key.";
  }
  return null;
}

let warned = false;
export function logSmsConfigOnce(): void {
  if (warned) return;
  warned = true;
  const problem = smsConfigProblem();
  if (problem) console.error(`[sms] NOT READY: ${problem}`);
}

export function smsEnvironment(): "sandbox" | "live" {
  return isAfricasTalkingSandbox() ? "sandbox" : "live";
}

export async function sendSMS(params: SendSmsParams): Promise<SendSmsResult> {
  if (smsConfigProblem()) logSmsConfigOnce();
  return provider().sendSMS(params);
}

export function isSmsConfigured(): boolean {
  return smsConfigProblem() === null;
}
