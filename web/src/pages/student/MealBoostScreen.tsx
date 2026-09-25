import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Check } from "lucide-react";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { initializeBoostPayment, verifyPayment } from "../../services/paymentsApi";

const PRESETS = [200, 500, 1000, 2000];

type Stage = "form" | "opening_checkout" | "waiting" | "confirming" | "success" | "error";

/**
 * Same verified-payment shape as BudgetOnboardingScreen (initialize ->
 * open Paystack checkout -> poll verify -> only THEN is anything
 * credited) — see that screen's own comment for the full rationale,
 * including why window.open() replaces expo-web-browser here too.
 * The only real difference is what's being paid for: this tops up
 * the plan the student already has, it doesn't start a new one.
 */
export default function MealBoostScreen() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  const [amount, setAmount] = useState("500");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const referenceRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);

  const startPayment = async () => {
    setError(null);
    const boostAmount = Number(amount);

    if (!boostAmount || boostAmount <= 0) return setError("Enter an amount greater than zero.");
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter a valid phone number for M-Pesa.");
    if (!user?.email) return setError("Your account has no email on file — please contact support.");

    setStage("opening_checkout");
    try {
      const { reference, checkoutUrl } = await initializeBoostPayment(authFetch, {
        amount: boostAmount,
        phone: phone.trim(),
        email: user.email,
      });
      referenceRef.current = reference;

      setStage("waiting");
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      pollForConfirmation();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
      setStage("error");
    }
  };

  const pollForConfirmation = async () => {
    setStage("confirming");
    pollAttemptsRef.current = 0;
    poll();
  };

  const poll = async () => {
    if (!referenceRef.current) return;
    pollAttemptsRef.current += 1;

    try {
      const result = await verifyPayment(authFetch, referenceRef.current);
      if (result.status === "success") {
        setStage("success");
        setTimeout(() => {
          navigate("/student/home", { replace: true });
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
      setError(err instanceof Error ? err.message : "Could not check payment status.");
      setStage("error");
    }
  };

  if (stage === "opening_checkout" || stage === "waiting" || stage === "confirming") {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
        <p style={styles.statusText}>
          {stage === "opening_checkout" && "Starting payment…"}
          {stage === "waiting" && "Opening M-Pesa checkout…"}
          {stage === "confirming" && "Confirming your payment…"}
        </p>
        <p style={styles.statusSubtext}>{stage === "confirming" && "This can take up to a minute — don't close the app."}</p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div style={styles.center}>
        <Check size={40} color={COLORS.success} />
        <p style={styles.statusText}>Boost confirmed!</p>
        <p style={styles.statusSubtext}>Updating your plan…</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.iconRow}>
        <div style={styles.modeIcon}>
          <Zap size={16} color={COLORS.primary} />
        </div>
        <h1 style={styles.title}>Meal Boost</h1>
      </div>
      <p style={styles.subtitle}>
        Add a bit more money to your current plan — it goes straight into what's left, so your daily amount goes up for the rest
        of the plan.
      </p>

      <span style={styles.label}>How much would you like to add?</span>
      <div style={styles.amountRow}>
        <span style={styles.currencyPrefix}>KSh</span>
        <input style={styles.amountInput} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div style={styles.pillRow}>
        {PRESETS.map((v) => (
          <button key={v} style={styles.presetPill} onClick={() => setAmount(String(v))}>
            <span style={styles.presetPillText}>KSh {v.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <span style={{ ...styles.label, marginTop: 20 }}>M-Pesa phone number to pay with</span>
      <input style={styles.input} type="tel" inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />

      {error && <p style={styles.error}>{error}</p>}

      <PrimaryButton onPress={startPayment} style={{ marginTop: 20 }}>
        Boost my plan
      </PrimaryButton>

      <button onClick={() => navigate(-1)} style={{ alignSelf: "center" }}>
        <span style={styles.cancelLink}>Not now</span>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 60, display: "flex", flexDirection: "column" },
  center: { flex: 1, width: "100%", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, marginTop: 16, textAlign: "center" },
  statusSubtext: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 6, textAlign: "center" },
  iconRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  modeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(252,244,234,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontSize: 21, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 12, marginBottom: 22, lineHeight: "19px" },
  label: { display: "block", fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark, marginBottom: 8 },
  amountRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.border}`,
    paddingLeft: 16,
    paddingRight: 16,
  },
  currencyPrefix: { fontSize: 16, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.primaryLight, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 18, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, paddingTop: 14, paddingBottom: 14, backgroundColor: "transparent", outline: "none" },
  input: {
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    border: `1.5px solid ${COLORS.border}`,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    fontFamily: FONTS.displayBold,
    fontWeight: 800,
    color: COLORS.textOnDark,
    outline: "none",
    width: "100%",
  },
  pillRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  presetPill: {
    border: `1.5px solid ${COLORS.primaryLight}`,
    borderRadius: RADIUS.pill,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
  },
  presetPillText: { color: COLORS.primaryLight, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center" },
  cancelLink: { color: COLORS.textOnDarkMuted, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, textAlign: "center", marginTop: 18 },
};
