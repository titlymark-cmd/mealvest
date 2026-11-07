import axios from "axios";
import { env } from "../config/env";
import { SmsProvider, SendSmsParams, SendSmsResult, SmsDeliveryError, SmsFailureReason } from "./smsProvider";

const AT_TIMEOUT_MS = 10_000;

/** Africa's Talking uses a separate sandbox host when the username is literally "sandbox". */
export function isAfricasTalkingSandbox(): boolean {
  return env.africasTalkingUsername === "sandbox";
}

function baseUrl(): string {
  if (env.africasTalkingBaseUrl) return env.africasTalkingBaseUrl;
  return isAfricasTalkingSandbox()
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

/**
 * Africa's Talking per-recipient status codes (Bulk SMS API).
 *   100 Processed, 101 Sent, 102 Queued          -> accepted
 *   everything else                              -> NOT delivered
 */
const ACCEPTED = new Set(["100", "101", "102"]);
const FAILURE_BY_CODE: Record<string, SmsFailureReason> = {
  "401": "blocked", // RiskHold
  "402": "invalid_sender", // InvalidSenderId
  "403": "invalid_number", // InvalidPhoneNumber
  "404": "invalid_number", // UnsupportedNumberType
  "405": "insufficient_balance", // InsufficientBalance
  "406": "blocked", // UserInBlacklist
  "407": "provider", // CouldNotRoute
  "409": "blocked", // DoNotDisturbRejection
  "500": "provider", // InternalServerError
  "501": "provider", // GatewayError
  "502": "provider", // RejectedByGateway
};

const USER_MESSAGES: Record<SmsFailureReason, string> = {
  invalid_number: "That phone number can't receive SMS. Check the number in your profile.",
  insufficient_balance: "We couldn't send the SMS right now. Please try again later.",
  invalid_sender: "We couldn't send the SMS right now. Please try again later.",
  blocked: "We couldn't send an SMS to that number. Please try again later.",
  auth: "We couldn't send the SMS right now. Please try again later.",
  provider: "We couldn't send the SMS right now. Please try again later.",
  network: "We couldn't send the SMS right now. Please try again later.",
};

function fail(reason: SmsFailureReason, detail: string): never {
  // Operator-facing detail goes to the log (no phone number, no message body: the body holds the code).
  console.error(`[sms:africastalking] NOT delivered — reason=${reason} ${detail} env=${isAfricasTalkingSandbox() ? "sandbox" : "live"}`);
  throw new SmsDeliveryError(reason, USER_MESSAGES[reason]);
}

export class AfricasTalkingSmsProvider implements SmsProvider {
  async sendSMS({ phoneNumber, message }: SendSmsParams): Promise<SendSmsResult> {
    if (!/^254\d{9}$/.test(phoneNumber)) {
      fail("invalid_number", "(number is not in 254XXXXXXXXX form; provider not called)");
    }

    const body = new URLSearchParams({
      username: env.africasTalkingUsername,
      to: `+${phoneNumber}`,
      message,
      // Optional until Africa's Talking approves an alphanumeric sender ID.
      ...(env.africasTalkingSenderId ? { from: env.africasTalkingSenderId } : {}),
    });

    let data: any;
    try {
      const res = await axios.post(baseUrl(), body, {
        headers: {
          apiKey: env.africasTalkingApiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: AT_TIMEOUT_MS,
      });
      data = res.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) fail("auth", `(HTTP ${status}: invalid API key or username)`);
        if (status && status >= 400 && status < 500) fail("provider", `(HTTP ${status})`);
        fail("network", status ? `(HTTP ${status})` : `(${err.code === "ECONNABORTED" ? "timeout" : "network error"})`);
      }
      fail("network", "(unexpected error)");
    }

    const recipients: Array<{ statusCode?: number | string; status?: string; messageId?: string }> =
      data?.SMSMessageData?.Recipients ?? [];
    const recipient = recipients[0];

    if (!recipient) {
      // AT answers an unroutable/invalid number with an empty Recipients list and a summary message.
      const summary = String(data?.SMSMessageData?.Message ?? "no recipients in response");
      if (/invalid|number/i.test(summary)) fail("invalid_number", `(summary="${summary.slice(0, 80)}")`);
      fail("provider", `(summary="${summary.slice(0, 80)}")`);
    }

    const code = String(recipient.statusCode);
    if (!ACCEPTED.has(code)) {
      fail(FAILURE_BY_CODE[code] ?? "provider", `(statusCode=${code} status=${String(recipient.status ?? "").slice(0, 60)})`);
    }
    if (!recipient.messageId) {
      fail("provider", `(statusCode=${code} but no messageId returned)`);
    }

    return { providerMessageId: String(recipient.messageId), raw: data, sandbox: isAfricasTalkingSandbox() };
  }
}
