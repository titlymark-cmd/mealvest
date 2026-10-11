export interface InitializePaymentInput {
  amount?: number;
  numberOfDays?: number;
  planId?: string;
  phone: string;
  email: string;
  hotelId?: string | null;
  termsAccepted: true;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export type PaymentProviderName = "paystack" | "cyzora";

export interface PaymentConfig {
  provider: PaymentProviderName;
  hostedCheckoutAvailable: boolean;
  testMode: boolean;
}

/** Which provider the server routes NEW payments to, and whether a hosted checkout page exists for it (Cyzora only). */
export async function getPaymentConfig(authFetch: AuthFetch): Promise<PaymentConfig> {
  const res = await authFetch("/api/payments/config");
  return parseOrError(res, "Could not load payment options.");
}

/**
 * STK-push initialize — sends an M-Pesa prompt straight to the
 * student's phone through whichever provider the server has active
 * (Paystack's /charge or Cyzora's POST /charges, see
 * paystackProvider.ts / cyzoraProvider.ts) and returns `displayText`,
 * what to show the student while they enter their PIN. There's no
 * checkout page to open. This function never marks anything as paid
 * itself — that only happens after the provider confirms via
 * webhook/verify (see verifyPayment below), per the backend's
 * activatePaymentIfNeeded, which the frontend has no way to shortcut.
 */
export async function initializePayment(
  authFetch: AuthFetch,
  input: InitializePaymentInput
): Promise<{ reference: string; displayText?: string; provider?: PaymentProviderName }> {
  const res = await authFetch("/api/payments/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrError(res, "Could not start payment.");
}

export interface InitializeBoostInput {
  amount: number;
  phone: string;
  email: string;
}

/**
 * Meal Boost — tops up the student's EXISTING active plan instead of
 * starting a new one. Shares the same STK-push/verify shape as
 * initializePayment (and reuses verifyPayment below unchanged) — only
 * the initialize endpoint differs, since the backend needs to know
 * this is a top-up (see payments.controller.ts initializeBoostPayment).
 */
export async function initializeBoostPayment(
  authFetch: AuthFetch,
  input: InitializeBoostInput
): Promise<{ reference: string; displayText?: string; provider?: PaymentProviderName }> {
  const res = await authFetch("/api/payments/boost/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrError(res, "Could not start Meal Boost payment.");
}

/**
 * Cyzora HOSTED checkout — the server creates the session and returns
 * a `checkoutUrl` to navigate the browser to. Cyzora sends the student
 * back to /payment/callback?reference=<ours>, which only ever polls
 * verifyPayment() below: the `?status=success` Cyzora adds to that
 * redirect is never read, because anyone could type it.
 */
export async function initializeCheckoutPayment(
  authFetch: AuthFetch,
  input: InitializePaymentInput
): Promise<{ reference: string; checkoutUrl: string; expiresIn: number }> {
  const res = await authFetch("/api/payments/cyzora/checkout/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrError(res, "Could not open the checkout page.");
}

/** Provider-agnostic — the server verifies against whichever provider created this reference. */
export async function verifyPayment(
  authFetch: AuthFetch,
  reference: string
): Promise<{ status: "pending" | "success" | "failed"; alreadyProcessed: boolean; provider?: PaymentProviderName }> {
  const res = await authFetch(`/api/payments/verify/${encodeURIComponent(reference)}`);
  return parseOrError(res, "Could not verify payment.");
}

export async function getPaymentStatus(
  authFetch: AuthFetch,
  reference: string
): Promise<{ status: string; amount: string; provider: string }> {
  const res = await authFetch(`/api/payments/${reference}/status`);
  return parseOrError(res, "Could not check payment status.");
}
