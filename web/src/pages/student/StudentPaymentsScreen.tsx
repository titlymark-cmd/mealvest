import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Receipt, PiggyBank } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { listMyPayments, StudentPayment } from "../../services/paymentsApi";
import { listMyWithdrawals, WithdrawalRecord } from "../../services/budgetApi";

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Awaiting confirmation", color: COLORS.warning },
  processing: { label: "Awaiting confirmation", color: COLORS.warning },
  success: { label: "Paid", color: COLORS.success },
  failed: { label: "Failed — not charged", color: COLORS.danger },
  cancelled: { label: "Cancelled", color: COLORS.textFaint },
  expired: { label: "Expired", color: COLORS.textFaint },
  refunded: { label: "Refunded", color: COLORS.textFaint },
};

const WITHDRAWAL_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Requested — being processed", color: COLORS.warning },
  processing: { label: "Being sent", color: COLORS.warning },
  completed: { label: "Sent to M-Pesa", color: COLORS.success },
  failed: { label: "Failed — MEALVEST will follow up", color: COLORS.danger },
  rejected: { label: "Declined", color: COLORS.danger },
};

const TYPE_LABEL: Record<string, string> = {
  budget_topup: "Meal plan payment",
  plan_boost: "Meal Boost top-up",
  order_payment: "Order payment",
  refund: "Refund",
};

const PROVIDER_LABEL: Record<string, string> = { cyzora: "M-Pesa via Cyzora", paystack: "M-Pesa via Paystack", daraja: "M-Pesa" };

const ksh = (v: string | number) => `KSh ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The student's own ledger: every plan payment / boost attempt with
 * the outcome the server recorded (set only by provider verify or
 * webhook — nothing here is derived client-side), plus their savings
 * withdrawals with MEALVEST's fee shown separately.
 */
export default function StudentPaymentsScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"payments" | "savings">("payments");

  const load = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([listMyPayments(authFetch), listMyWithdrawals(authFetch)]);
      setPayments(p);
      setWithdrawals(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your payments.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPaid = payments.filter((p) => p.status === "success").reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <h1 style={styles.title}>Payments &amp; savings</h1>
      <p style={styles.subtitle}>Everything you've paid into MEALVEST and every withdrawal, with its reference.</p>

      <div style={styles.tabRow}>
        <button onClick={() => setTab("payments")} style={{ ...styles.tab, ...(tab === "payments" ? styles.tabActive : null) }}>
          <Receipt size={14} color={tab === "payments" ? "#fff" : COLORS.textOnDarkMuted} />
          <span style={{ ...styles.tabText, ...(tab === "payments" ? styles.tabTextActive : null) }}>Payments</span>
        </button>
        <button onClick={() => setTab("savings")} style={{ ...styles.tab, ...(tab === "savings" ? styles.tabActive : null) }}>
          <PiggyBank size={14} color={tab === "savings" ? "#fff" : COLORS.textOnDarkMuted} />
          <span style={{ ...styles.tabText, ...(tab === "savings" ? styles.tabTextActive : null) }}>Savings withdrawals</span>
        </button>
      </div>

      {loading && (
        <div style={{ marginTop: 30, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}

      {!loading && !error && tab === "payments" && (
        <>
          <Card style={styles.summaryCard}>
            <span style={styles.summaryLabel}>TOTAL PAID INTO MEAL PLANS</span>
            <span style={styles.summaryValue}>{ksh(totalPaid)}</span>
            <span style={styles.summarySub}>{payments.filter((p) => p.status === "success").length} successful payments</span>
          </Card>
          {payments.length === 0 && <p style={styles.emptyText}>No payments yet.</p>}
          <div style={styles.list}>
            {payments.map((p) => {
              const st = PAYMENT_STATUS[p.status] || { label: p.status, color: COLORS.textFaint };
              return (
                <Card key={p.id} style={styles.rowCard}>
                  <div style={styles.rowTop}>
                    <span style={styles.rowTitle}>{TYPE_LABEL[p.type] || p.type}</span>
                    <span style={styles.rowAmount}>{ksh(p.amount)}</span>
                  </div>
                  <span style={{ ...styles.rowStatus, color: st.color }}>{st.label}</span>
                  <span style={styles.rowMeta}>
                    {when(p.created_at)} · {PROVIDER_LABEL[p.provider] || p.provider}
                    {p.number_of_days ? ` · ${p.number_of_days}-day plan` : ""}
                    {p.hotel_name ? ` · ${p.hotel_name}` : ""}
                  </span>
                  {p.provider_reference && <span style={styles.rowRef}>Ref {p.provider_reference}</span>}
                  {p.status === "failed" && p.result_description && <span style={styles.rowNote}>{p.result_description}</span>}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!loading && !error && tab === "savings" && (
        <>
          {withdrawals.length === 0 && (
            <Card style={styles.summaryCard}>
              <p style={styles.emptyInCard}>
                No savings withdrawals yet. When a plan ends, any unspent balance (including days you carried over) can be
                withdrawn to M-Pesa from your dashboard. MEALVEST keeps a small fee, shown before you confirm.
              </p>
            </Card>
          )}
          <div style={styles.list}>
            {withdrawals.map((w) => {
              const st = WITHDRAWAL_STATUS[w.status] || { label: w.status, color: COLORS.textFaint };
              return (
                <Card key={w.id} style={styles.rowCard}>
                  <div style={styles.rowTop}>
                    <span style={styles.rowTitle}>Savings withdrawal{w.hotel_name ? ` · ${w.hotel_name}` : ""}</span>
                    <span style={styles.rowAmount}>{ksh(w.student_amount)}</span>
                  </div>
                  <span style={{ ...styles.rowStatus, color: st.color }}>{st.label}</span>
                  <span style={styles.rowMeta}>
                    {when(w.created_at)} · savings {ksh(w.gross_savings)} − fee {Number(w.platform_fee_percent)}% ({ksh(w.platform_fee_amount)})
                  </span>
                  <span style={styles.rowMeta}>
                    To {w.payout_method === "mpesa" ? "M-Pesa" : w.payout_method || ""} {w.payout_destination}
                  </span>
                  {w.payout_reference && <span style={styles.rowRef}>M-Pesa ref {w.payout_reference}</span>}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column", maxWidth: 640 },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 14 },
  tabRow: { display: "flex", flexDirection: "row", gap: 6, backgroundColor: COLORS.bgDeep, borderRadius: RADIUS.pill, padding: 4, alignSelf: "flex-start" },
  tab: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: RADIUS.pill },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textOnDarkMuted },
  tabTextActive: { color: "#fff" },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginTop: 20 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 20, textAlign: "center" },
  emptyInCard: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, margin: 0, lineHeight: "19px" },
  summaryCard: { marginTop: 16, display: "flex", flexDirection: "column" },
  summaryLabel: { fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 700, color: COLORS.textFaint, letterSpacing: 0.6 },
  summaryValue: { fontSize: 24, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, marginTop: 2 },
  summarySub: { fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  list: { display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24, marginTop: 14 },
  rowCard: { display: "flex", flexDirection: "column", padding: 14, gap: 3 },
  rowTop: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  rowTitle: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  rowAmount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text, flexShrink: 0 },
  rowStatus: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11 },
  rowMeta: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  rowRef: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, wordBreak: "break-all" },
  rowNote: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.danger },
};
