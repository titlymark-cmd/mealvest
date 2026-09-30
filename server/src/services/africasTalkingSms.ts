import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";
import { SmsProvider, SendSmsParams, SendSmsResult } from "./smsProvider";

// Africa's Talking uses a separate sandbox host when the configured
// username is literally "sandbox" — their own documented convention
// for testing without sending a real SMS.
function baseUrl(): string {
  return env.africasTalkingUsername === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

export class AfricasTalkingSmsProvider implements SmsProvider {
  async sendSMS({ phoneNumber, message }: SendSmsParams): Promise<SendSmsResult> {
    const body = new URLSearchParams({
      username: env.africasTalkingUsername,
      to: `+${phoneNumber}`,
      message,
      ...(env.africasTalkingSenderId ? { from: env.africasTalkingSenderId } : {}),
    });

    try {
      const res = await axios.post(baseUrl(), body, {
        headers: {
          apiKey: env.africasTalkingApiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const recipient = res.data?.SMSMessageData?.Recipients?.[0];
      if (!recipient || String(recipient.statusCode) !== "101") {
        throw new ApiError(
          502,
          "SMS_SEND_FAILED",
          recipient?.status || "Africa's Talking rejected this SMS."
        );
      }

      return { providerMessageId: recipient.messageId, raw: res.data };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (axios.isAxiosError(err)) {
        console.error("[AfricasTalkingSmsProvider] request failed:", err.response?.data || err.message);
      }
      throw new ApiError(502, "SMS_SEND_FAILED", "Could not send SMS via Africa's Talking.");
    }
  }
}
