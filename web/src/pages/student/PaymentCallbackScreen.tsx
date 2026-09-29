import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { verifyPayment } from "../../services/paymentsApi";

type Stage = "confirming" | "success" | "error";

/**
 * Landing point for Paystack's own redirect back to us
 * (callback_url — see payments.controller.ts resolveCallbackUrl),
 * replacing the old window.open()-in-a-new-tab flow that a browser
 * could (and did, per the reported bug) block outright with no
 * reliable fallback. A full-page redirect can never be popup-blocked.
 *
 * The session survives this round trip because AuthContext persists
 * the refresh token (see AuthContext's SecureStore usage) and
 * silently re-establishes it on every fresh page load — RootGate
 * already blocks rendering on that before this screen ever mounts, so
 * `authFetch` here is guaranteed to be usable immediately.
 *
 * Paystack appends `?reference=...&trxref=...` to whatever callback_url
 * was set at initialize time; both carry the same value we generated
 * ourselves, but nothing here trusts the URL beyond using it to know
 * WHICH payment to ask the backend to verify — verifyPayment always
 * re-checks Paystack's own API server-side and never activates
 * anything just because the browser landed back here.
 */
export default function PaymentCallbackScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [stage, setStage] = useState<Stage>("confirming");
  const [error, setError] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);

  useEffect(() => {
    if (!reference) {
      setError("No payment reference was returned. If you completed a payment, check your dashboard shortly.");
      setStage("error");
      return;
    }

    let cancelled = false;

    const poll = async () => {
      pollAttemptsRef.current += 1;
      try {
        const result = await verifyPayment(authFetch, reference);
        if (cancelled) return;
        if (result.status === "success") {
          setStage("success");
          // Passed through from BudgetOnboardingScreen, which stashed it
          // here because a real redirect to Paystack and back loses
          // React Router's in-memory navigation state.
          const hotelName = sessionStorage.getItem("mealvest_pending_hotel_name");
          sessionStorage.removeItem("mealvest_pending_hotel_name");
          setTimeout(() => {
            if (!cancelled) navigate("/student/home", { replace: true, state: hotelName ? { hotelName } : undefined });
          }, 1200);
          return;
        }
        if (result.status === "failed") {
          setError("Payment failed or was cancelled. You have not been charged.");
          setStage("error");
          return;
        }
        if (pollAttemptsRef.current >= 15) {
          setError(
            "We haven't received confirmation yet. If you completed the payment, check back on your dashboard shortly — it will update automatically once Paystack confirms."
          );
          setStage("error");
          return;
        }
        setTimeout(poll, 6000);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not check payment status.");
        setStage("error");
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

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
