import React, { useEffect, useState, useCallback } from "react";
import { Wallet, CheckCircle2, XCircle, TrendingUp, Search, PiggyBank } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { timeAgo, formatKsh } from "../../components/admin/adminFormat";
import {
  fetchDailyLedger,
  fetchWithdrawals,
  fetchTransactions,
  updateWithdrawalStatus,
  DailyLedger,
  AdminWithdrawal,
  AdminTransaction,
  AdminTransactionTotals,
  TransactionFilters,
} from "../../services/adminApi";

const WITHDRAWAL_STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  processing: COLORS.accent,
  completed: COLORS.success,
  failed: COLORS.danger,
  rejected: COLORS.danger,
};

const TX_STATUS_COLOR: Record<string, string> = {
  pending: COLORS.warning,
  processing: COLORS.warning,
  success: COLORS.success,
  failed: COLORS.danger,
  cancelled: COLORS.textFaint,
  expired: COLORS.textFaint,
  refunded: COLORS.textFaint,
};

const TX_TYPE_LABEL: Record<string, string> = {
  budget_topup: "Plan payment",
  plan_boost: "Meal Boost",
  order_payment: "Order payment",
  refund: "Refund",
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

/**
 * Admin Payments: (1) a per-day ledger with a date picker, (2) the
 * full transaction ledger with date/status/provider/type/search
 * filters and provider references, (3) savings-withdrawal follow-ups
 * with the MEALVEST fee shown separately and actions to record how
 * each request was closed. Every figure comes from the same frozen
 * server rows; nothing here is estimated.
 */
export default function AdminPaymentsScreen() {
  const { authFetch } = useAuth();

  const [ledgerDate, setLedgerDate] = useState(todayIso());
  const [ledger, setLedger] = useState<DailyLedger | null>(null);

  const [withdrawalView, setWithdrawalView] = useState<"unresolved" | "completed">("unresolved");
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const [filters, setFilters] = useState<TransactionFilters>({ from: daysAgoIso(29), to: todayIso() });
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [totals, setTotals] = useState<AdminTransactionTotals | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(
    async (date: string) => {
      try {
        setLedger(await fetchDailyLedger(authFetch, date));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the ledger.");
      }
    },
    [authFetch]
  );

  const loadWithdrawals = useCallback(
    async (view: "unresolved" | "completed") => {
      try {
        setWithdrawals(await fetchWithdrawals(authFetch, view));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load withdrawals.");
      }
    },
    [authFetch]
  );

  const loadTransactions = useCallback(
    async (f: TransactionFilters) => {
      setTxLoading(true);
      try {
        const data = await fetchTransactions(authFetch, f);
        setTransactions(data.transactions);
        setTotals(data.totals);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the payment ledger.");
      } finally {
        setTxLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    (async () => {
      await Promise.all([loadLedger(ledgerDate), loadWithdrawals(withdrawalView), loadTransactions(filters)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) loadLedger(ledgerDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerDate]);

  useEffect(() => {
    if (!loading) loadWithdrawals(withdrawalView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawalView]);

  useEffect(() => {
    if (!loading) loadTransactions(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const act = async (w: AdminWithdrawal, status: "processing" | "completed" | "failed" | "rejected") => {
    let payoutReference: string | undefined;
    let note: string | undefined;
    if (status === "completed") {
      const ref = window.prompt(
        `Mark as COMPLETED — enter the M-Pesa/bank confirmation reference for the ${formatKsh(w.student_amount)} sent to ${w.payout_destination}:`
      );
      if (!ref || !ref.trim()) return;
      payoutReference = ref.trim();
    } else if (status === "rejected" || status === "failed") {
      const n = window.prompt(`Reason to record for marking this withdrawal ${status}:`);
      if (n === null) return;
      note = n.trim() || undefined;
    }
    setActingOn(w.id);
    setError(null);
    try {
      await updateWithdrawalStatus(authFetch, w.id, { status, payoutReference, note });
      await loadWithdrawals(withdrawalView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this withdrawal.");
    } finally {
      setActingOn(null);
    }
  };

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
      <p style={styles.subtitle}>Daily ledger, every payment with its provider reference, and savings withdrawal follow-ups.</p>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.twoCol}>
        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <div>
              <span style={styles.panelTitle}>Daily ledger</span>
              <span style={styles.panelSubtitle}>Pick any day</span>
            </div>
            <input type="date" value={ledgerDate} max={todayIso()} onChange={(e) => setLedgerDate(e.target.value)} style={styles.dateInput} />
          </div>

          {ledger && (
            <div style={styles.ledgerList}>
              <LedgerTile icon={<Wallet size={16} color={COLORS.accent} />} label="Plans collected" amount={ledger.plansCollected.amount} count={ledger.plansCollected.count} />
              <LedgerTile icon={<CheckCircle2 size={16} color={COLORS.success} />} label="Meals redeemed" amount={ledger.mealsRedeemed.amount} count={ledger.mealsRedeemed.count} />
              <LedgerTile icon={<XCircle size={16} color={COLORS.danger} />} label="Failed payments" amount={ledger.failedPayments.amount} count={ledger.failedPayments.count} />
              <LedgerTile icon={<TrendingUp size={16} color={COLORS.primary} />} label="Commission earned" amount={ledger.commissionEarned.amount} count={ledger.commissionEarned.count} />
            </div>
          )}
        </Card>

        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <div style={styles.followUpHeader}>
              <PiggyBank size={16} color={COLORS.warning} />
              <div>
                <span style={styles.panelTitle}>Savings withdrawals</span>
                <span style={styles.panelSubtitle}>
                  {withdrawalView === "unresolved" ? "Requests needing action" : "Completed payouts"}
                </span>
              </div>
            </div>
            <div style={styles.segment}>
              {(["unresolved", "completed"] as const).map((v) => (
                <button key={v} onClick={() => setWithdrawalView(v)} style={{ ...styles.segmentBtn, ...(withdrawalView === v ? styles.segmentBtnActive : null) }}>
                  <span style={{ ...styles.segmentText, ...(withdrawalView === v ? styles.segmentTextActive : null) }}>
                    {v === "unresolved" ? "Open" : "Done"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {withdrawals.length === 0 && (
            <p style={styles.emptyText}>{withdrawalView === "unresolved" ? "No open withdrawal requests." : "No completed withdrawals yet."}</p>
          )}

          {withdrawals.map((w) => (
            <div key={w.id} style={styles.withdrawalRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.withdrawalName}>{w.student_name || w.student_email}</span>
                <span style={styles.withdrawalMeta}>
                  {w.hotel_name || "No hotel"} · {timeAgo(w.created_at)} · to {w.payout_method} {w.payout_destination}
                </span>
                <span style={styles.withdrawalMeta}>
                  Savings {formatKsh(w.gross_savings)} − MEALVEST fee {Number(w.platform_fee_percent ?? 0)}% ({formatKsh(w.platform_fee_amount ?? 0)})
                  {w.payout_reference ? ` · ref ${w.payout_reference}` : ""}
                  {w.admin_note ? ` · ${w.admin_note}` : ""}
                </span>
                {(w.status === "pending" || w.status === "processing" || w.status === "failed") && (
                  <div style={styles.actionRow}>
                    {w.status === "pending" && (
                      <button className="mv-action" onClick={() => act(w, "processing")} disabled={actingOn === w.id} style={styles.actionBtn}>
                        <span style={styles.actionText}>Mark sending</span>
                      </button>
                    )}
                    <button className="mv-action" onClick={() => act(w, "completed")} disabled={actingOn === w.id} style={{ ...styles.actionBtn, backgroundColor: COLORS.success }}>
                      <span style={styles.actionText}>Paid out ✓</span>
                    </button>
                    <button onClick={() => act(w, "rejected")} disabled={actingOn === w.id} style={styles.actionBtnGhost}>
                      <span style={{ ...styles.actionText, color: COLORS.danger }}>Decline</span>
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <span style={styles.withdrawalAmount}>{formatKsh(w.student_amount)}</span>
                <span style={{ ...styles.statusBadge, backgroundColor: WITHDRAWAL_STATUS_COLOR[w.status] || COLORS.textFaint }}>{w.status}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ ...styles.panelCard, marginTop: 16 }}>
        <div style={styles.panelHeaderRow}>
          <div>
            <span style={styles.panelTitle}>Payment ledger</span>
            <span style={styles.panelSubtitle}>Every plan payment and boost attempt, with our reference and the provider's id</span>
          </div>
        </div>

        <div style={styles.filterRow}>
          <label style={styles.filterLabel}>
            From
            <input type="date" value={filters.from || ""} max={filters.to || todayIso()} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} style={styles.dateInputLight} />
          </label>
          <label style={styles.filterLabel}>
            To
            <input type="date" value={filters.to || ""} min={filters.from} max={todayIso()} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} style={styles.dateInputLight} />
          </label>
          <label style={styles.filterLabel}>
            Status
            <select value={filters.status || ""} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))} style={styles.select}>
              <option value="">All</option>
              {["success", "pending", "processing", "failed", "cancelled", "expired", "refunded"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.filterLabel}>
            Provider
            <select value={filters.provider || ""} onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined }))} style={styles.select}>
              <option value="">All</option>
              <option value="cyzora">Cyzora</option>
              <option value="paystack">Paystack</option>
              <option value="daraja">Daraja</option>
            </select>
          </label>
          <label style={styles.filterLabel}>
            Type
            <select value={filters.type || ""} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value || undefined }))} style={styles.select}>
              <option value="">All</option>
              <option value="budget_topup">Plan payment</option>
              <option value="plan_boost">Meal Boost</option>
            </select>
          </label>
          <form
            style={styles.searchWrap}
            onSubmit={(e) => {
              e.preventDefault();
              setFilters((f) => ({ ...f, search: search.trim() || undefined }));
            }}
          >
            <Search size={14} color={COLORS.textFaint} />
            <input
              style={styles.searchInput}
              placeholder="Reference, provider id, student email, name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>

        {totals && (
          <div style={styles.totalsRow}>
            <span style={styles.totalsItem}>
              <strong>{totals.count}</strong> records
            </span>
            <span style={styles.totalsItem}>
              <strong>{formatKsh(totals.success_amount)}</strong> successful ({totals.success_count})
            </span>
            <span style={styles.totalsItem}>
              <strong>{formatKsh(totals.failed_amount)}</strong> failed ({totals.failed_count})
            </span>
            <span style={styles.totalsItem}>
              <strong>{totals.pending_count}</strong> pending
            </span>
          </div>
        )}

        {txLoading ? (
          <div style={{ display: "flex", padding: 20 }}>
            <Spinner color={COLORS.primary} />
          </div>
        ) : transactions.length === 0 ? (
          <p style={styles.emptyText}>No payments match these filters.</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["When", "Student", "Type", "Amount", "Status", "Provider", "Reference", "Provider id", "Hotel"].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td style={styles.td}>{when(t.created_at)}</td>
                    <td style={styles.td}>
                      <span style={styles.tdStrong}>{t.student_name || "—"}</span>
                      <span style={styles.tdSub}>{t.student_email}</span>
                    </td>
                    <td style={styles.td}>
                      {TX_TYPE_LABEL[t.type] || t.type}
                      {t.number_of_days ? <span style={styles.tdSub}>{t.number_of_days} days</span> : null}
                    </td>
                    <td style={{ ...styles.td, ...styles.tdStrong }}>{formatKsh(t.amount)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.statusBadge, backgroundColor: TX_STATUS_COLOR[t.status] || COLORS.textFaint }}>{t.status}</span>
                      {t.status === "failed" && t.result_description && <span style={styles.tdSub}>{t.result_description}</span>}
                    </td>
                    <td style={styles.td}>
                      {t.provider}
                      {t.provider_channel ? <span style={styles.tdSub}>{t.provider_channel.replace("_", " ")}</span> : null}
                    </td>
                    <td style={{ ...styles.td, ...styles.mono }}>{t.provider_reference || "—"}</td>
                    <td style={{ ...styles.td, ...styles.mono }}>{t.provider_transaction_id || "—"}</td>
                    <td style={styles.td}>{t.hotel_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 18 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" },
  panelCard: { display: "flex", flexDirection: "column", padding: 18 },
  panelHeaderRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  panelTitle: { display: "block", fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  panelSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  followUpHeader: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10 },
  segment: { display: "flex", flexDirection: "row", gap: 4, backgroundColor: COLORS.borderSoft, borderRadius: RADIUS.pill, padding: 3 },
  segmentBtn: { padding: "5px 12px", borderRadius: RADIUS.pill },
  segmentBtnActive: { backgroundColor: COLORS.card },
  segmentText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textMuted },
  segmentTextActive: { color: COLORS.text },
  dateInput: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, backgroundColor: COLORS.cardWhite, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm, padding: "6px 8px" },
  dateInputLight: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, backgroundColor: COLORS.cardWhite, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm, padding: "6px 8px" },
  select: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, backgroundColor: COLORS.cardWhite, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm, padding: "6px 8px" },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "20px 0" },
  ledgerList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 14 },
  ledgerTile: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10 },
  ledgerIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ledgerLabel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  ledgerCount: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 1 },
  ledgerAmount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  withdrawalRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${COLORS.borderSoft}` },
  withdrawalName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  withdrawalMeta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2, wordBreak: "break-word" },
  withdrawalAmount: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.text, flexShrink: 0 },
  actionRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  actionBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, padding: "6px 12px" },
  actionBtnGhost: { borderRadius: RADIUS.pill, padding: "6px 12px", border: `1px solid ${COLORS.borderSoft}` },
  actionText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff" },
  statusBadge: { borderRadius: RADIUS.pill, padding: "4px 10px", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: "#fff", textTransform: "capitalize", flexShrink: 0, display: "inline-block" },
  filterRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10, marginTop: 10, marginBottom: 10 },
  filterLabel: { display: "flex", flexDirection: "column", gap: 4, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textMuted },
  searchWrap: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 220, backgroundColor: COLORS.cardWhite, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm, padding: "6px 10px" },
  searchInput: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, border: "none", outline: "none", backgroundColor: "transparent" },
  totalsRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 16, fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  totalsItem: {},
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 860 },
  th: { textAlign: "left", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.textFaint, textTransform: "uppercase", letterSpacing: 0.4, padding: "8px 8px", borderBottom: `1px solid ${COLORS.borderSoft}` },
  td: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, padding: "8px 8px", borderBottom: `1px solid ${COLORS.borderSoft}`, verticalAlign: "top" },
  tdStrong: { fontFamily: FONTS.bodySemibold, fontWeight: 600, display: "block" },
  tdSub: { display: "block", fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, marginTop: 2 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, wordBreak: "break-all" },
};
