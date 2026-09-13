/**
 * Provider-agnostic payment interface. PaystackPaymentProvider
 * implements this now. src/mpesa/daraja.ts is deliberately NOT
 * wrapped into this interface in this pass — it keeps working
 * exactly as it is (unused by any route yet, same as before). A
 * future DarajaPaymentProvider implementing this same interface is
 * a drop-in later, not a rewrite of daraja.ts itself.
 */

export interface InitializePaymentParams {
  userId: string;
  amount: number; // KSh, whole currency unit — provider adapters convert to subunits internally if needed
  phoneNumber: string; // already normalized to 254XXXXXXXXX
  email: string;
  reference: string; // our own unique reference, generated before calling the provider
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  reference: string;
  providerReference: string;
  checkoutUrl?: string; // present for redirect-based providers (Paystack); absent for STK-push-based ones
  raw: unknown; // full provider response, stored for audit but never trusted for status
}

export interface VerifyPaymentResult {
  reference: string;
  status: "success" | "failed" | "pending";
  amount: number;
  currency: string;
  providerTransactionId: string;
  paidAt: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  /** Validates and parses a raw webhook request; throws if the signature is invalid. */
  handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<VerifyPaymentResult>;
  getPaymentStatus(reference: string): Promise<VerifyPaymentResult["status"]>;
}
