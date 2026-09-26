import React, { useEffect, useState, useCallback } from "react";
import { Wallet, CheckCircle2, XCircle, TrendingUp, AlertCircle } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { timeAgo, formatKsh } from "../../components/admin/adminFormat";
import { fetchDailyLedger, fetchWithdrawals, DailyLedger, AdminWithdrawal } from "../../services/adminApi";

const WITHDRAWAL_STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  processing: COLORS.accent,
  completed: COLORS.success,
  failed: COLORS.danger,
  rejected: COLORS.danger,
};

function LedgerTile({ icon, label, amount, count }: { icon: React.ReactNode; label: string; amount: string; count: string }) {
  return (
    <div style={styles.ledgerTile}>
      <div style={styles.ledgerIcon}>{icon}</div>
      <div style={{ flex: 1 }}>
        <span style={styles.ledgerLabel}>{label}</span>
        <span style={styles.ledgerCount}>
          {count} {Number(count) === 1 ? "record" : "records"}
        </span>
      </div>
      <span style={styles.ledgerAmount}>{formatKsh(amount)}</span>
    </div>
  );
}

export default function AdminPaymentsScreen() {
  const { authFetch } = useAuth();
  const [ledger, setLedger] = useState<DailyLedger | null>(null);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [led, w] = await Promise.all([fetchDailyLedger(authFetch), fetchWithdrawals(authFetch, "unresolved")]);
      setLedger(led);
      setWithdrawals(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payment data.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Payments</h1>
      <p style={styles.subtitle}>Today's ledger and withdrawal follow-ups.</p>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.twoCol}>
        <Card style={styles.panelCard}>
          <span style={styles.panelTitle}>Today's ledger</span>
          <span style={styles.panelSubtitle}>{ledger?.date}</span>

          {ledger && (
            <div style={styles.ledgerList}>
              <LedgerTile
                icon={<Wallet size={16} color={COLORS.accent} />}
                label="Plans collected"
                amount={ledger.plansCollected.amount}
                count={ledger.plansCollected.count}
              />
              <LedgerTile
                icon={<CheckCircle2 size={16} color={COLORS.success} />}
                label="Meals redeemed"
                amount={ledger.mealsRedeemed.amount}
                count={ledger.mealsRedeemed.count}
              />
              <LedgerTile
                icon={<XCircle size={16} color={COLORS.danger} />}
                label="Failed payments"
                amount={ledger.failedPayments.amount}
                count={ledger.failedPayments.count}
              />
              <LedgerTile
                icon={<TrendingUp size={16} color={COLORS.primary} />}
                label="Commission earned"
                amount={ledger.commissionEarned.amount}
                count={ledger.commissionEarned.count}
              />
            </div>
          )}
        </Card>

        <Card style={styles.panelCard}>
          <div style={styles.followUpHeader}>
            <AlertCircle size={16} color={COLORS.warning} />
            <div>
              <span style={styles.panelTitle}>Follow-ups</span>
              <span style={styles.panelSubtitle}>Withdrawal requests needing action</span>
            </div>
          </div>

          {withdrawals.length === 0 && <p style={styles.emptyText}>No unresolved withdrawal requests.</p>}

          {withdrawals.map((w) => (
            <div key={w.id} style={styles.withdrawalRow}>
              <div style={{ flex: 1 }}>
                <span style={styles.withdrawalName}>{w.student_name || w.student_email}</span>
                <span style={styles.withdrawalMeta}>
                  {w.hotel_name || "No hotel"} · {timeAgo(w.created_at)}
                </span>
              </div>
              <span style={styles.withdrawalAmount}>{formatKsh(w.student_amount)}</span>
              <span style={{ ...styles.statusBadge, backgroundColor: WITHDRAWAL_STATUS_COLOR[w.status] || COLORS.textFaint }}>
                {w.status}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 18 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" },
  panelCard: { display: "flex", flexDirection: "column", padding: 18 },
  panelTitle: { display: "block", fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  panelSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  followUpHeader: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "20px 0" },
  ledgerList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 14 },
  ledgerTile: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10 },
  ledgerIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentSoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ledgerLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  ledgerCount: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 1 },
  ledgerAmount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  withdrawalRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  withdrawalName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  withdrawalMeta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  withdrawalAmount: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.text, flexShrink: 0 },
  statusBadge: {
    borderRadius: RADIUS.pill,
    padding: "4px 10px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 10,
    color: "#fff",
    textTransform: "capitalize",
    flexShrink: 0,
  },
};
