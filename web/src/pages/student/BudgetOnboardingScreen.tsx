import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Check } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { initializePayment, verifyPayment } from "../../services/paymentsApi";

const PRESETS = [2000, 3000, 5000, 12000, 15000];

const DISCLAIMER_TEXT =
  "Before you continue, please understand:\n\n" +
  "• Money committed to your Mealvest plan is intended for meals during the selected plan period.\n" +
  "• Committed funds are not immediately withdrawable or refundable before the plan period ends, except where a supported cancellation policy applies.\n" +
  "• Unused daily meal balance is carried forward automatically according to Mealvest's rules.\n" +
  "• Please review your amount, days, and hotel before confirming.";

type Stage = "form" | "opening_checkout" | "waiting" | "confirming" | "success" | "error";

/**
 * Real Paystack flow, matching exactly what the backend actually
 * enforces:
 *   1. initializePayment() — requires termsAccepted:true, or the
 *      backend rejects the request before Paystack is ever contacted.
 *   2. Open the returned checkoutUrl in a new tab — this is the ONLY
 *      place money can actually move; nothing in this screen can mark
 *      a payment successful on its own. (The original app used
 *      expo-web-browser's openBrowserAsync, which awaits until that
 *      browser session closes before polling; window.open() doesn't
 *      offer an equivalent await, so polling starts right away
 *      instead — it already retries every 6s regardless of whether
 *      the tab is still open, so this doesn't change the outcome.)
 *   3. Poll verifyPayment() — which calls Paystack's own API
 *      server-side and only THEN activates the budget. A closed
 *      browser tab is not, by itself, evidence of anything; verify()
 *      is the actual source of truth.
 *   4. Timeout after ~90s of polling if Paystack never confirms —
 *      the student can check again later rather than being stuck on
 *      an infinite spinner.
 */
export default function BudgetOnboardingScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hotelId, hotelName, selectedItemName, selectedItemPrice } = (location.state as any) || {};
  const { authFetch, user } = useAuth();

  const [amount, setAmount] = useState("5000");
  const [amountFocused, setAmountFocused] = useState(false);
  const [days, setDays] = useState("30");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const referenceRef = useRef<string | null>(null);
  const checkoutUrlRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);

  const dailyAllowance = (() => {
    const a = Number(amount);
    const d = Number(days);
    if (!a || !d) return null;
    return Math.round((a / d) * 100) / 100;
  })();

  const startPayment = async () => {
    setError(null);
    const totalAmount = Number(amount);
    const numberOfDays = Number(days);

    if (!totalAmount || totalAmount <= 0) return setError("Enter an amount greater than zero.");
    if (!numberOfDays || numberOfDays <= 0) return setError("Enter at least 1 day.");
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter a valid phone number for M-Pesa.");
    if (!termsAccepted) return setError("Please accept the Mealvest payment terms to continue.");
    if (!user?.email) return setError("Your account has no email on file — please contact support.");

    setStage("opening_checkout");
    try {
      const { reference, checkoutUrl } = await initializePayment(authFetch, {
        amount: totalAmount,
        numberOfDays,
        phone: phone.trim(),
        email: user.email,
        hotelId: hotelId ?? null,
        termsAccepted: true,
      });
      referenceRef.current = reference;
      checkoutUrlRef.current = checkoutUrl;

      setStage("waiting");
      // A browser can silently block this popup because it fires after
      // the `await initializePayment(...)` above — outside the direct
      // click-handler call stack most browsers require to allow
      // window.open() without a user gesture. When that happens, fall
      // back to a manual "Open payment page" button below (a real click
      // on that button is its own gesture, so it always works).
      const win = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      setPopupBlocked(!win);
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
          navigate("/student/home", { replace: true, state: { hotelName } });
        }, 1200);
        return;
      }
      if (result.status === "failed") {
        setError("Payment failed or was cancelled. You have not been charged.");
        setStage("error");
        return;
      }
      // still "pending" — Paystack/M-Pesa confirmation can take a
      // little while; keep checking for up to ~90 seconds total.
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

        {popupBlocked && checkoutUrlRef.current && (stage === "waiting" || stage === "confirming") && (
          <>
            <p style={styles.statusSubtext}>Your browser blocked the checkout popup.</p>
            <button
              onClick={() => window.open(checkoutUrlRef.current!, "_blank", "noopener,noreferrer")}
              style={styles.secondaryLinkBtn}
            >
              <span style={styles.secondaryLinkText}>Open payment page</span>
            </button>
          </>
        )}

        {stage === "confirming" && (
          <button onClick={() => navigate("/student/home")} style={styles.secondaryLinkBtn}>
            <span style={styles.secondaryLinkText}>View my dashboard now</span>
          </button>
        )}
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div style={styles.center}>
        <Check size={40} color={COLORS.success} />
        <p style={styles.statusText}>Payment confirmed!</p>
        <p style={styles.statusSubtext}>Setting up your plan…</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <h1 style={styles.title}>Set up your plan</h1>
      <p style={styles.subtitle}>
        {hotelName ? `For ${hotelName}. ` : ""}
        Tell us how much you have and how many days it should cover.
      </p>

      {selectedItemName && (
        <Card style={styles.chosenCard}>
          <span style={styles.chosenLabel}>You requested</span>
          <span style={styles.chosenItem}>
            {selectedItemName} — KSh {Number(selectedItemPrice).toLocaleString()}
          </span>
        </Card>
      )}

      <span style={styles.label}>How much do you have for food?</span>
      <div
        style={{
          ...styles.amountRow,
          borderColor: amountFocused ? "#ff8a3d" : COLORS.border,
          boxShadow: amountFocused ? "0 0 0 3px rgba(245, 166, 35, 0.3)" : "none",
        }}
      >
        <span style={styles.currencyPrefix}>KSh</span>
        <input
          className="mv-input-plain"
          style={styles.amountInput}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onFocus={() => setAmountFocused(true)}
          onBlur={() => setAmountFocused(false)}
        />
      </div>
      <div style={styles.pillRow}>
        {PRESETS.map((v) => (
          <button key={v} style={styles.presetPill} onClick={() => setAmount(String(v))}>
            <span style={styles.presetPillText}>KSh {v.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <span style={{ ...styles.label, marginTop: 20 }}>How many days should this cover?</span>
      <input style={styles.input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />

      <span style={{ ...styles.label, marginTop: 20 }}>M-Pesa phone number to pay with</span>
      <input style={styles.input} type="tel" inputMode="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />

      {dailyAllowance !== null && (
        <div style={styles.summaryCard}>
          <div style={styles.summaryHeader}>
            <Sparkles size={14} color="#fff" />
            <span style={styles.summaryLabel}>DAILY MEAL CREDIT</span>
          </div>
          <span style={styles.summaryValue}>KSh {dailyAllowance.toLocaleString()}/day</span>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}
      {stage === "error" && (
        <button onClick={() => navigate("/student/home")} style={{ ...styles.secondaryLinkBtn, alignSelf: "center" }}>
          <span style={styles.secondaryLinkText}>Check my dashboard instead — a payment may still confirm</span>
        </button>
      )}

      <Card style={styles.disclaimerCard}>
        <span style={styles.disclaimerTitle}>IMPORTANT MEALVEST TERMS</span>
        <p style={styles.disclaimerBody}>{DISCLAIMER_TEXT}</p>
      </Card>

      <button style={styles.checkboxRow} onClick={() => setTermsAccepted((v) => !v)}>
        <div style={{ ...styles.checkbox, ...(termsAccepted ? styles.checkboxChecked : null) }}>
          {termsAccepted && <Check size={13} color="#fff" strokeWidth={3} />}
        </div>
        <span style={styles.checkboxLabel}>I have read and understand the Mealvest payment and contract terms.</span>
      </button>

      <PrimaryButton onPress={startPayment} disabled={!termsAccepted} style={{ marginTop: 14 }}>
        Pay with M-Pesa
      </PrimaryButton>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  center: { flexShrink: 0, width: "100%", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.textOnDark, marginTop: 16, textAlign: "center" },
  statusSubtext: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 6, textAlign: "center" },
  secondaryLinkBtn: { marginTop: 18 },
  secondaryLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary, textAlign: "center" },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 24 },
  chosenCard: { marginBottom: 20, backgroundColor: COLORS.accentSoft, display: "flex", flexDirection: "column" },
  chosenLabel: { fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textMuted, textTransform: "uppercase" },
  chosenItem: { fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text, marginTop: 2 },
  label: { display: "block", fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark, marginBottom: 8 },
  amountRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    border: "1.5px solid",
    paddingLeft: 16,
    paddingRight: 16,
    transition: "border-color 160ms ease, box-shadow 160ms ease",
  },
  currencyPrefix: { fontSize: 16, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.primaryLight, marginRight: 8 },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONTS.displayBold,
    fontWeight: 800,
    color: COLORS.textOnDark,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
  },
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
  summaryCard: {
    borderRadius: RADIUS.lg,
    padding: 16,
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  summaryHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  summaryLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: FONTS.bodySemibold, fontWeight: 600, letterSpacing: 0.5 },
  summaryValue: { color: "#fff", fontSize: 20, fontFamily: FONTS.displayBold, fontWeight: 800 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center" },
  disclaimerCard: { marginTop: 22, backgroundColor: COLORS.accentSoft, borderColor: "#F4C79E", display: "flex", flexDirection: "column" },
  disclaimerTitle: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#8A4416", letterSpacing: 0.5, marginBottom: 8 },
  disclaimerBody: { fontFamily: FONTS.body, fontSize: 12, color: "#6B4A08", lineHeight: "18px", margin: 0, whiteSpace: "pre-line" },
  checkboxRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14, textAlign: "left" },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, border: `2px solid ${COLORS.border}`,
    display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxLabel: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, lineHeight: "17px" },
};
