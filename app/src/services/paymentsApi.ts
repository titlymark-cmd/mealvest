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

/**
 * Real Paystack initialize call — returns `checkoutUrl`, which the
 * screen opens (e.g. via expo-web-browser) for the student to
 * actually pay. This function never marks anything as paid itself —
 * that only happens after Paystack confirms via webhook/verify, per
 * the backend's activatePaymentIfNeeded, which the frontend has no
 * way to shortcut.
 */
export async function initializePayment(
  authFetch: AuthFetch,
  input: InitializePaymentInput
): Promise<{ reference: string; checkoutUrl: string }> {
  const res = await authFetch("/api/payments/paystack/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrError(res, "Could not start payment.");
}

export async function verifyPayment(
  authFetch: AuthFetch,
  reference: string
): Promise<{ status: "pending" | "success" | "failed"; alreadyProcessed: boolean }> {
  const res = await authFetch(`/api/payments/paystack/verify/${reference}`);
  return parseOrError(res, "Could not verify payment.");
}

export async function getPaymentStatus(
  authFetch: AuthFetch,
  reference: string
): Promise<{ status: string; amount: string; provider: string }> {
  const res = await authFetch(`/api/payments/${reference}/status`);
  return parseOrError(res, "Could not check payment status.");
}
