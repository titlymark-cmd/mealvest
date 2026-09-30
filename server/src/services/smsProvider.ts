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
}

export interface SmsProvider {
  sendSMS(params: SendSmsParams): Promise<SendSmsResult>;
}
