import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { SmsProvider, SendSmsParams, SendSmsResult } from "./smsProvider";
import { AfricasTalkingSmsProvider } from "./africasTalkingSms";

/**
 * Selects the configured SMS provider by SMS_PROVIDER. Throws a clear
 * error if unset or unrecognized, rather than silently no-opping —
 * matching storageService/emailService's own "not configured yet"
 * pattern. notificationService catches this and logs a 'skipped'
 * delivery row rather than letting it propagate (see there).
 */
function provider(): SmsProvider {
  if (env.smsProvider === "africastalking") {
    if (!env.africasTalkingApiKey || !env.africasTalkingUsername) {
      throw new ApiError(
        500,
        "SMS_NOT_CONFIGURED",
        "SMS is not configured on this server yet. Set AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME."
      );
    }
    return new AfricasTalkingSmsProvider();
  }
  throw new ApiError(
    500,
    "SMS_NOT_CONFIGURED",
    "SMS is not configured on this server yet. Set SMS_PROVIDER=africastalking plus its credentials."
  );
}

export async function sendSMS(params: SendSmsParams): Promise<SendSmsResult> {
  return provider().sendSMS(params);
}

export function isSmsConfigured(): boolean {
  return env.smsProvider === "africastalking" && Boolean(env.africasTalkingApiKey && env.africasTalkingUsername);
}
