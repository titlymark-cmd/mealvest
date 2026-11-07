import { ApiError } from "../middleware/errorHandler";
/**
 * Provider-agnostic SMS interface, same shape this codebase already
 * uses for PaymentProvider (paymentProvider.ts) — one concrete
 * implementation exists today (Africa's Talking), a second is a
 * drop-in later, not a rewrite of the notification system.
 */
export interface SendSmsParams {
  phoneNumber: string; // already normalized to 254XXXXXXXXX
  message: string;
}

export interface SendSmsResult {
  providerMessageId: string;
  raw: unknown;
  /** True when the provider's sandbox accepted it — NOT delivered to a real handset. */
  sandbox?: boolean;
}

/** Why an SMS was not delivered. `invalid_number` is the only reason the end user can act on. */
export type SmsFailureReason =
  | "invalid_number"
  | "insufficient_balance"
  | "invalid_sender"
  | "blocked"
  | "auth"
  | "provider"
  | "network";

export class SmsDeliveryError extends ApiError {
  reason: SmsFailureReason;
  constructor(reason: SmsFailureReason, message: string) {
    super(reason === "invalid_number" ? 400 : 502, "SMS_SEND_FAILED", message);
    this.reason = reason;
  }
}

export interface SmsProvider {
  sendSMS(params: SendSmsParams): Promise<SendSmsResult>;
}
