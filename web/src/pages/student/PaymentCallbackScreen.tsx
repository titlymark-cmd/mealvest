import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { usePaymentStatusPoll } from "../../hooks/usePaymentStatusPoll";

type Stage = "confirming" | "success" | "error";

/**
 * No longer reachable from the normal payment flow — Paystack
 * initialize now triggers an M-Pesa STK push directly (see
 * paystackProvider.ts) instead of a hosted-checkout redirect, so
 * BudgetOnboardingScreen/MealBoostScreen poll in place and never send
 * the browser here. Kept working (using the same usePaymentStatusPoll
 * hook those screens use) as a fallback for a stray bookmark/link
 * carrying a `?reference=...` query param, rather than deleted.
 */
export default function PaymentCallbackScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const poll = usePaymentStatusPoll(authFetch);

  const [stage, setStage] = useState<Stage>("confirming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setError("No payment reference was returned. If you completed a payment, check your dashboard shortly.");
      setStage("error");
      return;
    }
    poll.start(reference);
    return () => poll.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  useEffect(() => {
    if (poll.status === "success") {
      setStage("success");
      const timer = setTimeout(() => {
        navigate("/student/home", { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }
    if (poll.status === "failed") {
      setError("Payment failed or was cancelled. You have not been charged.");
      setStage("error");
    } else if (poll.status === "timeout") {
      setError(
        "We haven't received confirmation yet. If you completed the payment, check back on your dashboard shortly — it will update automatically once Paystack confirms."
      );
      setStage("error");
    } else if (poll.status === "error") {
      setError(poll.error || "Could not check payment status.");
      setStage("error");
    }
  }, [poll.status, poll.error, navigate]);

  if (stage === "success") {
    return (
      <div style={styles.center}>
        <Check size={40} color={COLORS.success} />
        <p style={styles.statusText}>Payment confirmed!</p>
        <p style={styles.statusSubtext}>Taking you to your dashboard…</p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div style={styles.center}>
        <p style={styles.errorText}>{error}</p>
        <button onClick={() => navigate("/student/home", { replace: true })} style={styles.link}>
          <span style={styles.linkText}>Go to my dashboard</span>
        </button>
      </div>
    );
  }

  return (
    <div style={styles.center}>
      <Spinner size="large" color={COLORS.primary} />
      <p style={styles.statusText}>Confirming your payment…</p>
      <p style={styles.statusSubtext}>This can take up to a minute — don't close this page.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    flexShrink: 0,
    width: "100%",
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    padding: 24,
  },
  statusText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, marginTop: 16, textAlign: "center" },
  statusSubtext: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 6, textAlign: "center" },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.danger, textAlign: "center" },
  link: { marginTop: 18 },
  linkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary, textAlign: "center" },
};
