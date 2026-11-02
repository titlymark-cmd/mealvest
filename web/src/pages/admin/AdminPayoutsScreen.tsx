import React, { useCallback, useEffect, useState } from "react";
import { formatPayoutTime12 } from "../../utils/payoutMode";
import { Wallet, Send, RefreshCw, Check, X, RotateCw, Copy } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPendingPayoutsOverview,
  fetchPayoutHistory,
  triggerPayout,
  refreshPayoutStatus,
  retryPayout,
  markPayoutFailed,
  markPayoutPaid,
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
  payout_unknown: "a previous payout's outcome is unconfirmed — resolve it in Payout history below",
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

/** Provider text stored on the payout, minus our own "Outcome unknown:" prefix. */
function providerMessage(p: HotelPayout): string | null {
  if (!p.failure_reason) return null;
  return p.failure_reason.replace(/^Outcome unknown:\s*/, "");
}

type Resolving = { id: string; outcome: "failed" | "paid" } | null;

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
  const [notice, setNotice] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Resolving>(null);
  const [note, setNote] = useState("");
  const [providerId, setProviderId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

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

  const handleRetry = async (payoutId: string) => {
    setError(null);
    setNotice(null);
    setActingOn(payoutId);
    try {
      const p = await retryPayout(authFetch, payoutId);
      setNotice(
        p.status === "unknown"
          ? `Retried — the provider still hasn't confirmed this payout (attempt ${p.submission_attempts ?? "?"}). See its message below.`
          : `Retried — payout is now ${p.status}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry this payout.");
    } finally {
      setActingOn(null);
    }
  };

  const openResolve = (id: string, outcome: "failed" | "paid") => {
    setResolving({ id, outcome });
    setNote("");
    setProviderId("");
    setConfirmed(false);
  };

  const submitResolve = async () => {
    if (!resolving) return;
    setError(null);
    setNotice(null);
    setActingOn(resolving.id);
    try {
      const input = { note: note.trim(), providerPayoutId: providerId.trim() };
      if (resolving.outcome === "failed") {
        await markPayoutFailed(authFetch, resolving.id, input);
        setNotice("Marked as failed. Its orders are back in Pending payouts — use Pay out to send them again under a new reference.");
      } else {
        await markPayoutPaid(authFetch, resolving.id, input);
        setNotice("Marked as paid.");
      }
      setResolving(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this payout.");
    } finally {
      setActingOn(null);
    }
  };

  const copyRef = (ref: string) => {
    try {
      void navigator.clipboard?.writeText(ref);
    } catch {
      /* clipboard unavailable — the reference is still shown on screen */
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
      {notice && <p style={styles.noticeText}>{notice}</p>}

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
        {history.filter((p) => matchesFilter(p, filter)).map((p) => {
          const stuck = p.status === "unknown" || p.status === "processing";
          const msg = providerMessage(p);
          const providerName = p.provider === "cyzora" ? "Cyzora" : p.provider === "paystack" ? "Paystack" : p.provider;
          const busy = actingOn === p.id;
          const isResolving = resolving?.id === p.id;
          return (
            <div key={p.id} style={styles.rowWrap}>
              <div style={styles.rowFlat}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={styles.rowTitle}>{p.hotel_name}</span>
                  <span style={styles.rowSub}>
                    {p.transfer_reference} · started {timeAgo(p.created_at)}
                    {(p.status === "successful" || p.status === "failed" || p.status === "cancelled") && ` · ${p.status} ${timeAgo(p.updated_at)}`}
                    {p.transfer_code && ` · provider ref ${p.transfer_code}`}
                    {p.automated ? " · automatic" : ""}
                    {p.needs_attention && p.status === "processing" && " — still processing; check the provider dashboard / webhook delivery"}
                    {p.review_reason && p.status === "review" && ` — needs approval: ${p.review_reason}`}
                    {!stuck && p.failure_reason && ` — ${p.failure_reason}`}
                  </span>
                </div>
                <span style={styles.amount}>KSh {Number(p.amount).toLocaleString()}</span>
                <span style={{ ...styles.statusChip, backgroundColor: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status] ?? p.status}</span>
                {p.status === "review" && (
                  <>
                    <button onClick={() => handleDecision(p.id, "approve")} disabled={busy} style={styles.refreshBtn} aria-label="Approve and send">
                      <Check size={14} color={COLORS.success} />
                    </button>
                    <button onClick={() => handleDecision(p.id, "cancel")} disabled={busy} style={styles.refreshBtn} aria-label="Cancel payout">
                      <X size={14} color={COLORS.danger} />
                    </button>
                  </>
                )}
                {stuck && (
                  <button onClick={() => handleRefresh(p.id)} disabled={busy} style={styles.refreshBtn} aria-label="Refresh status">
                    <RefreshCw size={13} color={COLORS.primary} />
                  </button>
                )}
              </div>

              {stuck && (
                <div style={styles.detailBox}>
                  {msg && (
                    <p style={styles.detailLine}>
                      <strong>{providerName} message:</strong> {msg}
                    </p>
                  )}
                  <p style={styles.detailLine}>
                    <strong>Send attempts:</strong> {p.submission_attempts ?? 0}
                    {p.last_reconciled_at ? ` · last checked ${timeAgo(p.last_reconciled_at)}` : " · not re-checked yet"}
                  </p>
                  <p style={styles.detailHint}>
                    {p.status === "unknown"
                      ? `${providerName} may or may not have this payout. Search the ${providerName} dashboard for ${p.transfer_reference} before choosing: Retry if it isn't there, Mark paid if it shows Paid, Mark failed if it shows Failed.`
                      : `Accepted by ${providerName} but not finalised. If the dashboard already shows Paid or Failed and this screen doesn't update, resolve it by hand.`}
                  </p>
                  <div style={styles.actionRow}>
                    {p.status === "unknown" && (
                      <button onClick={() => handleRetry(p.id)} disabled={busy} style={styles.actionBtn}>
                        <RotateCw size={12} color={COLORS.primary} /> {busy ? "Retrying…" : "Retry payout"}
                      </button>
                    )}
                    <button onClick={() => openResolve(p.id, "failed")} disabled={busy} style={{ ...styles.actionBtn, borderColor: COLORS.danger, color: COLORS.dangerText }}>
                      <X size={12} color={COLORS.danger} /> Mark failed
                    </button>
                    <button onClick={() => openResolve(p.id, "paid")} disabled={busy} style={{ ...styles.actionBtn, borderColor: COLORS.success, color: COLORS.successText }}>
                      <Check size={12} color={COLORS.success} /> Mark paid
                    </button>
                    <button onClick={() => copyRef(p.transfer_reference)} style={styles.actionBtn} aria-label="Copy reference">
                      <Copy size={12} color={COLORS.textMuted} /> Copy reference
                    </button>
                  </div>
                </div>
              )}

              {p.status === "failed" && (
                <div style={styles.detailBox}>
                  <p style={styles.detailHint}>
                    This payout's orders are back in Pending payouts. Fix the cause (e.g. the hotel's settlement details, or {providerName}'s status) and use Pay out there — it sends under a new reference.
                  </p>
                </div>
              )}

              {isResolving && resolving && (
                <div style={styles.resolvePanel}>
                  <span style={styles.resolveTitle}>{resolving.outcome === "failed" ? "Mark this payout as failed" : "Mark this payout as paid"}</span>
                  <label style={styles.fieldLabel} htmlFor={`note-${p.id}`}>What did you see in the {providerName} dashboard?</label>
                  <input
                    id={`note-${p.id}`}
                    style={styles.input}
                    value={note}
                    maxLength={300}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={resolving.outcome === "failed" ? "e.g. Failed — paybill rejected" : "e.g. Paid at 14:02"}
                  />
                  {resolving.outcome === "paid" && (
                    <>
                      <label style={styles.fieldLabel} htmlFor={`pid-${p.id}`}>{providerName} payout id (optional)</label>
                      <input id={`pid-${p.id}`} style={styles.input} value={providerId} maxLength={100} onChange={(e) => setProviderId(e.target.value)} />
                    </>
                  )}
                  <label style={styles.checkLabel}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    <span>
                      {resolving.outcome === "failed"
                        ? `I checked ${p.transfer_reference} in the ${providerName} dashboard and no money was sent. I understand its orders return to Pending payouts, and paying again will send money twice if it actually went through.`
                        : `I checked ${p.transfer_reference} in the ${providerName} dashboard and it shows as paid.`}
                    </span>
                  </label>
                  <div style={styles.actionRow}>
                    <button onClick={submitResolve} disabled={busy || !confirmed || note.trim().length < 3} style={{ ...styles.payBtn, opacity: confirmed && note.trim().length >= 3 ? 1 : 0.4 }}>
                      <span style={styles.payBtnText}>{busy ? "Saving…" : "Confirm"}</span>
                    </button>
                    <button onClick={() => setResolving(null)} disabled={busy} style={styles.actionBtn}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
  rowWrap: { borderTop: `1px solid ${COLORS.borderSoft}` },
  rowFlat: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, paddingBottom: 12 },
  noticeText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.success, marginBottom: 12 },
  detailBox: { backgroundColor: "rgba(44,22,16,0.05)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 },
  detailLine: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.text, margin: "2px 0" },
  detailHint: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, margin: "4px 0" },
  actionRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  actionBtn: {
    display: "flex", flexDirection: "row", alignItems: "center", gap: 5,
    fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary,
    borderWidth: 1, borderStyle: "solid", borderColor: COLORS.borderSoft, borderRadius: RADIUS.pill,
    padding: "5px 10px", backgroundColor: "transparent",
  },
  resolvePanel: { border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 },
  resolveTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 13, color: COLORS.text },
  fieldLabel: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  input: { fontFamily: FONTS.body, fontSize: 13, padding: "7px 9px", borderRadius: 6, border: `1px solid ${COLORS.borderSoft}`, color: COLORS.text, backgroundColor: "transparent" },
  checkLabel: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 8, fontFamily: FONTS.body, fontSize: 11, color: COLORS.text, marginTop: 4 },
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
