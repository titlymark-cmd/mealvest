import React, { useCallback, useEffect, useState } from "react";
import { Wallet, Send, RefreshCw } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPendingPayouts,
  fetchPayoutHistory,
  triggerPayout,
  refreshPayoutStatus,
  HotelPendingBalance,
  HotelPayout,
} from "../../services/hotelPayoutsApi";

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.textFaint,
  processing: COLORS.warning,
  successful: COLORS.success,
  failed: COLORS.danger,
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * HOTEL PAYOUT COMPLETED is a separate event from PAYMENT RECEIVED —
 * this screen is the one place that actually moves money toward a
 * hotel (via a real Paystack Transfer), deliberately admin-reviewed
 * rather than automatic per meal (see hotelPayoutService.ts's own
 * comment on why — the same pattern already used for student savings
 * withdrawals elsewhere in this app).
 */
export default function AdminPayoutsScreen() {
  const { authFetch } = useAuth();
  const [pending, setPending] = useState<HotelPendingBalance[]>([]);
  const [history, setHistory] = useState<HotelPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([fetchPendingPayouts(authFetch), fetchPayoutHistory(authFetch)]);
      setPending(p);
      setHistory(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payouts.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTrigger = async (hotelId: string) => {
    setError(null);
    setActingOn(hotelId);
    try {
      await triggerPayout(authFetch, hotelId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trigger this payout.");
    } finally {
      setActingOn(null);
    }
  };

  const handleRefresh = async (payoutId: string) => {
    setActingOn(payoutId);
    try {
      await refreshPayoutStatus(authFetch, payoutId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh this payout.");
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
      <div style={styles.titleRow}>
        <Wallet size={20} color={COLORS.primary} />
        <h1 style={styles.title}>Hotel Payouts</h1>
      </div>
      <p style={styles.subtitle}>Review what each hotel is owed and send a real payout via Paystack Transfer.</p>

      {error && <p style={styles.errorText}>{error}</p>}

      <Card style={styles.card}>
        <span style={styles.cardTitle}>Pending payouts</span>
        {pending.length === 0 && <p style={styles.emptyText}>No hotel currently has an unpaid balance.</p>}
        {pending.map((h) => {
          const supported = h.payment_method && ["mpesa_till", "send_money", "pochi_la_biashara"].includes(h.payment_method);
          return (
            <div key={h.hotel_id} style={styles.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.rowTitle}>{h.hotel_name}</span>
                <span style={styles.rowSub}>
                  {h.pending_order_count} redeemed order{h.pending_order_count === "1" ? "" : "s"} awaiting payout
                  {!supported && " — settlement method needs manual payout"}
                </span>
              </div>
              <span style={styles.amount}>KSh {Number(h.pending_amount).toLocaleString()}</span>
              <button
                className="mv-action"
                onClick={() => handleTrigger(h.hotel_id)}
                disabled={actingOn === h.hotel_id || !supported}
                style={{ ...styles.payBtn, opacity: supported ? 1 : 0.4 }}
              >
                <Send size={13} color="#fff" />
                <span style={styles.payBtnText}>{actingOn === h.hotel_id ? "Sending…" : "Pay out"}</span>
              </button>
            </div>
          );
        })}
      </Card>

      <Card style={styles.card}>
        <span style={styles.cardTitle}>Payout history</span>
        {history.length === 0 && <p style={styles.emptyText}>No payouts sent yet.</p>}
        {history.map((p) => (
          <div key={p.id} style={styles.row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={styles.rowTitle}>{p.hotel_name}</span>
              <span style={styles.rowSub}>
                {p.transfer_reference} · {timeAgo(p.created_at)}
                {p.failure_reason && ` — ${p.failure_reason}`}
              </span>
            </div>
            <span style={styles.amount}>KSh {Number(p.amount).toLocaleString()}</span>
            <span style={{ ...styles.statusChip, backgroundColor: STATUS_COLOR[p.status] }}>{p.status}</span>
            {p.status === "processing" && (
              <button onClick={() => handleRefresh(p.id)} disabled={actingOn === p.id} style={styles.refreshBtn} aria-label="Refresh status">
                <RefreshCw size={13} color={COLORS.primary} />
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, maxWidth: 760, display: "flex", flexDirection: "column" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  titleRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 18 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  card: { display: "flex", flexDirection: "column", marginBottom: 18 },
  cardTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text, marginBottom: 10 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, padding: "8px 0" },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 12,
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  rowTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  rowSub: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  amount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text, flexShrink: 0 },
  payBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    padding: "8px 14px",
    flexShrink: 0,
  },
  payBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "#fff" },
  statusChip: {
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    fontSize: 10,
    color: "#fff",
    borderRadius: RADIUS.pill,
    padding: "4px 10px",
    textTransform: "capitalize",
    flexShrink: 0,
  },
  refreshBtn: { padding: 6, flexShrink: 0 },
};
