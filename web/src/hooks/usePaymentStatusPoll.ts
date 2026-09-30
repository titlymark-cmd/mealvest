import { useCallback, useRef, useState } from "react";
import { verifyPayment } from "../services/paymentsApi";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type PaymentPollStatus = "polling" | "success" | "failed" | "timeout" | "error";

// Same cadence the old PaymentCallbackScreen used: 15 attempts, 6s
// apart (90s total) — long enough for a student to notice the STK
// prompt, enter their PIN, and for Paystack to confirm, short enough
// that a genuinely abandoned charge doesn't leave the screen hanging.
const MAX_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 6000;

/**
 * Extracted from PaymentCallbackScreen's original poll loop so
 * BudgetOnboardingScreen and MealBoostScreen — which now show an
 * in-app "check your phone" wait instead of redirecting to a Paystack
 * checkout page — can poll the exact same way, in place, without a
 * page navigation. verifyPayment always re-checks Paystack's own API
 * server-side; nothing here marks anything paid on its own.
 */
export function usePaymentStatusPoll(authFetch: AuthFetch) {
  const [status, setStatus] = useState<PaymentPollStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const attemptsRef = useRef(0);

  const start = useCallback(
    (reference: string) => {
      cancelledRef.current = false;
      attemptsRef.current = 0;
      setStatus("polling");
      setError(null);

      const poll = async () => {
        attemptsRef.current += 1;
        try {
          const result = await verifyPayment(authFetch, reference);
          if (cancelledRef.current) return;
          if (result.status === "success") {
            setStatus("success");
            return;
          }
          if (result.status === "failed") {
            setStatus("failed");
            return;
          }
          if (attemptsRef.current >= MAX_ATTEMPTS) {
            setStatus("timeout");
            return;
          }
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (err) {
          if (cancelledRef.current) return;
          setError(err instanceof Error ? err.message : "Could not check payment status.");
          setStatus("error");
        }
      };

      poll();
    },
    [authFetch]
  );

  const stop = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return { status, error, start, stop };
}
