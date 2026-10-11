import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, PiggyBank, Lock, Check, Smartphone } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { getWithdrawalStatus, requestWithdrawal, WithdrawalStatus, WithdrawalResult } from "../../services/budgetApi";
import { fetchStudentProfile } from "../../services/studentProfileApi";

const ksh = (v: number | string) => `KSh ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Withdraw the unspent balance of an ENDED plan — everything the
 * student didn't eat, including every day's rollover they carried
 * forward. The server decides whether it's unlocked (plan end date
 * reached, not already withdrawn) and applies MEALVEST's fee; this
 * screen only shows that breakdown and collects the M-Pesa number.
 * Nothing here can withdraw early: POST /student/withdraw re-checks
 * the lock inside a row lock regardless of what the UI showed.
 */
export default function WithdrawSavingsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<WithdrawalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [acceptFee, setAcceptFee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WithdrawalResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [st, profile] = await Promise.all([getWithdrawalStatus(authFetch), fetchStudentProfile(authFetch).catch(() => null)]);
      setStatus(st);
      if (profile?.phone_number) setPhone((p) => p || profile.phone_number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your savings.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (phone.replace(/\D/g, "").length < 9) return setError("Enter the M-Pesa number to send your savings to.");
    if (!acceptFee) return setError("Please confirm you understand the MEALVEST fee.");
    const net = status?.netAmount ?? 0;
    const confirmed = window.confirm(
      `Withdraw ${ksh(status?.availableSavings ?? 0)}?\n\n` +
        `MEALVEST fee (${status?.feePercent}%): ${ksh(status?.feeAmount ?? 0)}\n` +
        `You receive: ${ksh(net)} to ${phone.trim()}\n\n` +
        "This closes your current plan. Continue?"
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const r = await requestWithdrawal(authFetch, { payoutMethod: "mpesa", payoutDestination: phone.trim(), acceptFee: true });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request your withdrawal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  if (result) {
    return (
      <div style={styles.center}>
        <div style={styles.successCircle}>
          <Check size={28} color="#fff" strokeWidth={3} />
        </div>
        <p style={styles.statusTitle}>Withdrawal requested</p>
        <Card style={styles.breakdownCard}>
          <Row label="Savings withdrawn" value={ksh(result.gross_savings)} />
          <Row label={`MEALVEST fee (${result.platform_fee_percent}%)`} value={`− ${ksh(result.platform_fee_amount)}`} muted />
          <div style={styles.divider} />
          <Row label="You receive" value={ksh(result.student_amount)} strong />
        </Card>
        <p style={styles.statusSub}>
          MEALVEST sends this to {phone.trim()} by M-Pesa. You'll get a notification once it has gone out, and you can
          track it under Payments &amp; savings.
        </p>
        <button onClick={() => navigate("/student/home", { replace: true })} style={styles.linkBtn}>
          <span style={styles.linkText}>Back to my dashboard</span>
        </button>
      </div>
    );
  }

  const locked = !status || status.locked;
  const gross = Number(status?.availableSavings ?? 0);

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <div style={styles.headerRow}>
        <div style={styles.iconCircle}>
          <PiggyBank size={20} color="#fff" />
        </div>
        <div>
          <h1 style={styles.title}>Withdraw savings</h1>
          <p style={styles.subtitle}>Your unspent plan balance, including every day you carried over.</p>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {status && status.reason === "NO_ACTIVE_BUDGET" && (
        <Card style={styles.infoCard}>
          <p style={styles.infoText}>
            You don't have an active plan right now, so there's nothing to withdraw.
            {status.latestWithdrawal && (
              <>
                {" "}
                Your last withdrawal of <strong>{ksh(status.latestWithdrawal.student_amount)}</strong> is{" "}
                <strong>{status.latestWithdrawal.status}</strong>.
              </>
            )}
          </p>
          <button onClick={() => navigate("/student/payments")} style={styles.linkBtn}>
            <span style={styles.linkText}>See payments &amp; savings history</span>
          </button>
        </Card>
      )}

      {status && status.reason !== "NO_ACTIVE_BUDGET" && (
        <>
          <Card style={styles.breakdownCard}>
            <span style={styles.cardLabel}>AVAILABLE SAVINGS</span>
            <span style={styles.bigAmount}>{ksh(gross)}</span>
            <div style={styles.divider} />
            <Row label={`MEALVEST fee (${status.feePercent}%)`} value={`− ${ksh(status.feeAmount ?? 0)}`} muted />
            <Row label="You receive" value={ksh(status.netAmount ?? 0)} strong />
          </Card>

          {locked ? (
            <Card style={styles.lockCard}>
              <Lock size={16} color={COLORS.textMuted} />
              <div style={{ flex: 1 }}>
                <span style={styles.lockTitle}>
                  {status.reason === "ALREADY_WITHDRAWN" ? "Already withdrawn" : "Unlocks at the end of your plan"}
                </span>
                <span style={styles.lockText}>
                  {status.reason === "ALREADY_WITHDRAWN"
                    ? "This plan's savings have already been requested."
                    : `Savings can be withdrawn from ${formatDate(status.contractEndDate)}, once your plan period ends. Until then, carry unused credit forward and it stays yours.`}
                </span>
              </div>
            </Card>
          ) : (
            <>
              <span style={styles.label}>M-Pesa number to receive the money</span>
              <div style={styles.inputRow}>
                <Smartphone size={16} color={COLORS.textOnDarkMuted} />
                <input
                  style={styles.input}
                  type="tel"
                  inputMode="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <button style={styles.checkboxRow} onClick={() => setAcceptFee((v) => !v)}>
                <div style={{ ...styles.checkbox, ...(acceptFee ? styles.checkboxChecked : null) }}>
                  {acceptFee && <Check size={13} color="#fff" strokeWidth={3} />}
                </div>
                <span style={styles.checkboxLabel}>
                  I understand MEALVEST keeps a {status.feePercent}% fee on this withdrawal, that I receive{" "}
                  {ksh(status.netAmount ?? 0)}, and that this closes my current plan.
                </span>
              </button>

              <PrimaryButton onPress={submit} disabled={!acceptFee || submitting || gross <= 0} loading={submitting} style={{ marginTop: 16 }}>
                Withdraw {ksh(status.netAmount ?? 0)}
              </PrimaryButton>
            </>
          )}

          <button onClick={() => navigate("/terms")} style={styles.linkBtn}>
            <span style={styles.linkText}>Read the savings &amp; withdrawal policy</span>
          </button>
        </>
      )}
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div style={styles.row}>
      <span style={{ ...styles.rowLabel, ...(muted ? { color: COLORS.textFaint } : null) }}>{label}</span>
      <span style={{ ...styles.rowValue, ...(strong ? styles.rowValueStrong : null), ...(muted ? { color: COLORS.textMuted } : null) }}>
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column", maxWidth: 560 },
  center: { flexShrink: 0, width: "100%", minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  headerRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  iconCircle: { width: 42, height: 42, borderRadius: RADIUS.pill, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`, flexShrink: 0 },
  title: { fontSize: 20, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontSize: 12, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, margin: "2px 0 0 0" },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  infoCard: { display: "flex", flexDirection: "column", gap: 8 },
  infoText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, margin: 0, lineHeight: "19px" },
  breakdownCard: { display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 420 },
  cardLabel: { fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.6 },
  bigAmount: { fontSize: 28, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.borderSoft, margin: "6px 0" },
  row: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  rowLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  rowValueStrong: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.primary },
  lockCard: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  lockTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  lockText: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: "18px" },
  label: { display: "block", fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark, marginTop: 20, marginBottom: 8 },
  inputRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(252,244,234,0.06)", borderRadius: RADIUS.sm, border: `1.5px solid ${COLORS.border}`, paddingLeft: 14, paddingRight: 14 },
  input: { flex: 1, fontSize: 16, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, paddingTop: 13, paddingBottom: 13, backgroundColor: "transparent", border: "none", outline: "none" },
  checkboxRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16, textAlign: "left" },
  checkbox: { width: 20, height: 20, borderRadius: 5, border: `2px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxLabel: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, lineHeight: "17px" },
  linkBtn: { marginTop: 16, alignSelf: "center" },
  linkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary, textAlign: "center" },
  successCircle: { width: 56, height: 56, borderRadius: RADIUS.pill, backgroundColor: COLORS.success, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  statusTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 18, color: COLORS.textOnDark, margin: "0 0 14px 0", textAlign: "center" },
  statusSub: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 14, textAlign: "center", lineHeight: "18px", maxWidth: 380 },
};
