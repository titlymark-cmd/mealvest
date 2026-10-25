import React, { useCallback, useEffect, useState } from "react";
import { formatPayoutTime12 } from "../../utils/payoutMode";
import { Wallet, Send, RefreshCw, Check, X } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPendingPayoutsOverview,
  fetchPayoutHistory,
  triggerPayout,
  refreshPayoutStatus,
  approvePayout,
  cancelPayout,
  HotelPendingBalance,
  HotelPayout,
} from "../../services/hotelPayoutsApi";

/** How often the screen re-reads payouts while any are still in flight (the final status arrives later, via the provider's webhook). */
export const PAYOUT_POLL_MS = 15000;

/** Statuses that are not final and will change without any admin action. */
const IN_FLIGHT = ["pending", "approved", "processing", "unknown"];

const STATUS_LABEL: Record<string, string> = {
  unknown: "needs reconciliation",
};

const BLOCKED_REASON: Record<string, string> = {
  payout_pending: "a payout is waiting to be sent",
  payout_review: "a payout is awaiting approval",
  payout_approved: "a payout is approved and about to send",
  payout_unknown: "a previous payout's outcome is unconfirmed",
  failure_cooldown: "waiting after a recent failure",
  repeated_failures: "paused after repeated failures — retry manually",
};

type Filter = "all" | "attention" | "inprogress" | "successful" | "failed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "inprogress", label: "In progress" },
  { key: "successful", label: "Successful" },
  { key: "failed", label: "Failed" },
];

function matchesFilter(p: HotelPayout, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "attention") return Boolean(p.needs_attention) || p.status === "unknown" || p.status === "review";
  if (f === "inprogress") return IN_FLIGHT.includes(p.status);
  if (f === "successful") return p.status === "successful";
  return p.status === "failed";
}

const STATUS_COLOR: Record<string, string> = {
  pending: COLORS.textFaint,
  processing: COLORS.warning,
  successful: COLORS.success,
  failed: COLORS.danger,
  review: COLORS.warning,
  approved: COLORS.warning,
  unknown: COLORS.danger,
  cancelled: COLORS.textFaint,
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
 * HOTEL PAYOUT COMPLETED is a separate event from PAYMENT RECEIVED.
 * Payouts are now created AUTOMATICALLY by the server once a hotel's
 * unpaid earnings reach the payout threshold, so this screen is for
 * MONITORING (status, failures, reconciliation) plus a manual "Pay out"
 * fallback to retry. Payouts in flight are re-read on a timer because
 * their final status arrives later via the provider's webhook — without
 * that, a payout that succeeded would keep showing "processing" until
 * the page was reloaded.
 */
export default function AdminPayoutsScreen() {
  const { authFetch } = useAuth();
  const [pending, setPending] = useState<HotelPendingBalance[]>([]);
  const [thresholdKes, setThresholdKes] = useState<number | null>(null);
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState<HotelPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `silent` = background refresh: never flips the loading spinner or
  // replaces the screen's error with a transient network blip.
  const load = useCallback(
    async (silent = false) => {
      try {
        const [overview, h] = await Promise.all([fetchPendingPayoutsOverview(authFetch), fetchPayoutHistory(authFetch)]);
        setPending(overview.hotels);
        setThresholdKes(overview.thresholdKes);
        setAutoEnabled(overview.autoPayoutsEnabled);
        setHistory(h);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Could not load payouts.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    load();
  }, [load]);

  const hasInFlight = history.some((p) => IN_FLIGHT.includes(p.status));
  useEffect(() => {
    if (!hasInFlight) return;
    const tick = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const id = window.setInterval(tick, PAYOUT_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [hasInFlight, load]);

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

  const handleDecision = async (payoutId: string, decision: "approve" | "cancel") => {
    const p = history.find((x) => x.id === payoutId);
    const question =
      decision === "approve"
        ? `Approve and send KSh ${Number(p?.amount ?? 0).toLocaleString()} to ${p?.hotel_name ?? "this hotel"}?`
        : "Cancel this payout? Its orders go back to the unpaid balance.";
    if (!window.confirm(question)) return;
    setError(null);
    setActingOn(payoutId);
    try {
      await (decision === "approve" ? approvePayout(authFetch, payoutId) : cancelPayout(authFetch, payoutId));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this payout.");
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
      <p style={styles.subtitle}>
        {autoEnabled === false
          ? "Automatic payouts are currently OFF — use Pay out to send a hotel's balance."
          : thresholdKes !== null
          ? `Payouts are sent automatically once a hotel's unpaid earnings reach KSh ${thresholdKes.toLocaleString()}. Monitor their status here; use Pay out only to retry.`
          : "Review what each hotel is owed and monitor payout status."}
      </p>

      {error && <p style={styles.errorText}>{error}</p>}

      <Card style={styles.card}>
        <span style={styles.cardTitle}>Pending payouts</span>
        {pending.length === 0 && <p style={styles.emptyText}>No hotel currently has an unpaid balance.</p>}
        {pending.map((h) => {
          // Server decides per the ACTIVE provider (Paystack vs Cyzora
          // automate different settlement methods); the hardcoded list
          // is only a fallback for an older server response.
          const supported =
            typeof h.payout_supported === "boolean"
              ? h.payout_supported
              : Boolean(h.payment_method && ["mpesa_till", "send_money", "pochi_la_biashara"].includes(h.payment_method));
          return (
            <div key={h.hotel_id} style={styles.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.rowTitle}>{h.hotel_name}</span>
                <span style={styles.rowSub}>
                  {h.pending_order_count} redeemed order{h.pending_order_count === "1" ? "" : "s"} awaiting payout
                  {h.payout_mode === "daily" && ` — Daily payout at ${formatPayoutTime12(h.payout_time)} EAT`}
                  {h.payout_mode === "daily" && h.below_threshold && thresholdKes !== null && ` — below KSh ${thresholdKes.toLocaleString()}, carries forward`}
                  {h.payout_mode !== "daily" && h.below_threshold && thresholdKes !== null && ` — accumulating; pays automatically at KSh ${thresholdKes.toLocaleString()}`}
                  {!h.below_threshold && h.auto_payout_blocked_reason && ` — automatic payout paused: ${BLOCKED_REASON[h.auto_payout_blocked_reason] ?? h.auto_payout_blocked_reason}`}
                  {!supported && " — settlement method needs manual payout"}
                </span>
              </div>
              <span style={styles.amount}>KSh {Number(h.pending_amount).toLocaleString()}</span>
              <button
                className="mv-action"
                onClick={() => handleTrigger(h.hotel_id)}
                disabled={actingOn === h.hotel_id || !supported || Boolean(h.below_threshold)}
                style={{ ...styles.payBtn, opacity: supported && !h.below_threshold ? 1 : 0.4 }}
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
        <div style={styles.filterRow}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              style={{ ...styles.filterChip, ...(filter === f.key ? styles.filterChipActive : null) }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {history.length === 0 && <p style={styles.emptyText}>No payouts sent yet.</p>}
        {history.length > 0 && history.filter((p) => matchesFilter(p, filter)).length === 0 && (
          <p style={styles.emptyText}>No payouts match this filter.</p>
        )}
        {history.filter((p) => matchesFilter(p, filter)).map((p) => (
          <div key={p.id} style={styles.row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={styles.rowTitle}>{p.hotel_name}</span>
              <span style={styles.rowSub}>
                {p.transfer_reference} · started {timeAgo(p.created_at)}
                {(p.status === "successful" || p.status === "failed" || p.status === "cancelled") && ` · ${p.status} ${timeAgo(p.updated_at)}`}
                {p.transfer_code && ` · provider ref ${p.transfer_code}`}
                {p.automated ? " · automatic" : ""}
                {p.needs_attention && p.status === "processing" && " — still processing; check the provider dashboard / webhook delivery"}
                {p.review_reason && p.status === "review" && ` — needs approval: ${p.review_reason}`}
                {p.failure_reason && ` — ${p.failure_reason}`}
              </span>
            </div>
            <span style={styles.amount}>KSh {Number(p.amount).toLocaleString()}</span>
            <span style={{ ...styles.statusChip, backgroundColor: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status] ?? p.status}</span>
            {p.status === "review" && (
              <>
                <button onClick={() => handleDecision(p.id, "approve")} disabled={actingOn === p.id} style={styles.refreshBtn} aria-label="Approve and send">
                  <Check size={14} color={COLORS.success} />
                </button>
                <button onClick={() => handleDecision(p.id, "cancel")} disabled={actingOn === p.id} style={styles.refreshBtn} aria-label="Cancel payout">
                  <X size={14} color={COLORS.danger} />
                </button>
              </>
            )}
            {(p.status === "processing" || p.status === "unknown") && (
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
  filterRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  filterChip: {
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 11,
    color: COLORS.textMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.pill,
    padding: "4px 10px",
    backgroundColor: "transparent",
  },
  filterChipActive: { color: "#fff", backgroundColor: COLORS.primary, borderColor: COLORS.primary },
};
