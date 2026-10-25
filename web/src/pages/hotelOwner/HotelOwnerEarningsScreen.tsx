import React, { useCallback, useEffect, useState } from "react";
import { Landmark, Wallet, Clock, BadgeCheck, Receipt } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { SkeletonRegion, SkeletonStats, SkeletonList } from "../../components/ui/Skeleton";
import {
  Banner,
  EmptyState,
  PageHeader,
  Panel,
  PanelHead,
  StatTile,
  StatusPill,
  PAYOUT_STATUS,
  PAYMENT_METHOD,
  VERIFICATION_STATUS,
  formatDateTime,
  itemsSummary,
  orderCode,
  whole,
} from "../../components/hotel/hd";
import {
  fetchHotelDashboard,
  fetchHotelEarnings,
  fetchHotelOrders,
  HotelDashboard,
  HotelEarnings,
  HotelOrder,
} from "../../services/hotelStaffApi";
import { formatPayoutTime12, payoutScheduleLabel } from "../../utils/payoutMode";

export default function HotelOwnerEarningsScreen() {
  const { authFetch } = useAuth();
  const [dash, setDash] = useState<HotelDashboard | null>(null);
  const [earnings, setEarnings] = useState<HotelEarnings | null>(null);
  const [redeemed, setRedeemed] = useState<HotelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, e, r] = await Promise.all([
        fetchHotelDashboard(authFetch),
        fetchHotelEarnings(authFetch),
        fetchHotelOrders(authFetch, "redeemed").catch(() => [] as HotelOrder[]),
      ]);
      setDash(d);
      setEarnings(e);
      setRedeemed(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your earnings.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="hd-page mv-page">
        <SkeletonRegion label="earnings">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SkeletonStats count={3} />
            <SkeletonList rows={4} thumb="none" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (!dash || !earnings) {
    return (
      <div className="hd-page">
        <PageHeader eyebrow="Money" title="Earnings" />
        <Banner tone="bad" title="We couldn't load your earnings" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>}>
          {error ?? "Please try again."}
        </Banner>
      </div>
    );
  }

  const { hotel, stats } = dash;
  const { summary, payouts } = earnings;
  const verification = hotel.payment_verification_status;
  const verificationMeta = verification ? VERIFICATION_STATUS[verification] : undefined;
  const pendingAmount = Number(summary.pending_amount);

  return (
    <div className="hd-page mv-page">
      <PageHeader eyebrow="Money" title="Earnings" subtitle="What you've earned from redeemed meals, and what has been paid out to you." />

      <Panel dark aria-label="Awaiting payout">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ minWidth: 0 }}>
            <span className="hd-eyebrow">Awaiting payout</span>
            <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{whole(pendingAmount)}</div>
            <p className="hd-sub">
              {Number(summary.pending_order_count) > 0
                ? `From ${Number(summary.pending_order_count)} redeemed meal${Number(summary.pending_order_count) === 1 ? "" : "s"} not yet paid out.`
                : "Everything redeemed so far has been included in a payout."}
            </p>
          </div>
          <dl className="hd-kv" style={{ margin: 0, color: "var(--mv-cream)" }}>
            <div>
              <dt style={{ color: "rgba(252,244,234,.7)" }}>Settlement</dt>
              <dd>{payoutScheduleLabel({ payout_mode: summary.payout_mode ?? hotel.payout_mode, payout_time: summary.payout_time ?? hotel.payout_time, settlement_schedule: hotel.settlement_schedule })}</dd>
            </div>
            <div>
              <dt style={{ color: "rgba(252,244,234,.7)" }}>Paid to</dt>
              <dd>{hotel.payment_method ? PAYMENT_METHOD[hotel.payment_method] ?? hotel.payment_method : "Not set"}</dd>
            </div>
          </dl>
        </div>
        {summary.auto_enabled && (summary.payout_mode === "daily" ? <DailyPayoutNote summary={summary} pendingAmount={pendingAmount} /> : <AutoPayoutNote summary={summary} pendingAmount={pendingAmount} />)}
        {verificationMeta && (
          <div style={{ marginTop: 14 }}>
            <StatusPill tone={verificationMeta.tone} onDark>
              Payout details: {verificationMeta.label}
            </StatusPill>
          </div>
        )}
      </Panel>

      <section className="hd-stats" aria-label="Earnings summary">
        <StatTile icon={<Wallet size={17} color="#c93a22" />} label="Revenue today" value={whole(stats.revenue_today)} />
        <StatTile icon={<Receipt size={17} color="#c93a22" />} label="Total earned" value={whole(stats.net_earnings)} sub={`${Number(stats.redeemed_orders)} meals redeemed`} />
        <StatTile
          icon={<BadgeCheck size={17} color="#3f7d2c" />}
          label="Paid out to date"
          value={whole(summary.paid_out_total)}
          sub={summary.last_paid_at ? `Last paid ${formatDateTime(summary.last_paid_at)}` : "No payouts yet"}
        />
      </section>

      <div className="hd-grid-2">
        <Panel aria-label="Payout history">
          <PanelHead icon={<Landmark size={18} color="#c93a22" aria-hidden="true" />} title="Payout history" subtitle="Latest 50 payouts" />
          {payouts.length === 0 ? (
            <div className="hd-well" style={{ textAlign: "center", fontSize: 13, color: "#6b625c" }}>
              No payouts yet. Redeemed meals are paid out once your earnings are ready to send.
            </div>
          ) : (
            <div className="hd-list">
              {payouts.map((p) => {
                const meta = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: "muted" as const };
                return (
                  <div className="hd-row" key={p.id}>
                    <div className="hd-row-main">
                      <span className="hd-row-title">
                        {whole(p.amount)}
                        {p.automated && <span className="hd-row-meta" style={{ display: "inline", marginLeft: 8 }}>Automatic</span>}
                      </span>
                      <span className="hd-row-meta">
                        {formatDateTime(p.created_at)} · Ref {p.reference}
                      </span>
                      {p.status === "failed" && <span className="hd-row-meta" style={{ color: "#b83420", fontWeight: 600 }}>This payout didn't go through. Contact MEALVEST support with the reference.</span>}
                    </div>
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel aria-label="Recent redeemed meals">
          <PanelHead icon={<Clock size={18} color="#8f5600" aria-hidden="true" />} title="Recently redeemed" subtitle="What you earned per meal" />
          {redeemed.length === 0 ? (
            <EmptyState title="No redeemed meals yet">Earnings appear here as students collect their meals.</EmptyState>
          ) : (
            <div className="hd-list">
              {redeemed.slice(0, 8).map((o) => (
                <div className="hd-row" key={o.id}>
                  <div className="hd-row-main">
                    <span className="hd-row-title">{itemsSummary(o.items)}</span>
                    <span className="hd-row-meta">
                      {orderCode(o.id)} · {formatDateTime(o.redeemed_at)}
                    </span>
                  </div>
                  {o.hotel_amount != null && <span className="hd-amount">{whole(o.hotel_amount)}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const HOLD_MESSAGE: Record<string, string> = {
  payout_in_progress: "A payout is still being confirmed. Your next automatic payout starts once it settles.",
  failed_recently: "Your last payout didn't go through. MEALVEST will retry shortly.",
  needs_support: "Automatic payouts are paused after repeated failures. Please contact MEALVEST support.",
};

/** Daily mode: balance accumulates all day and is evaluated once, at the hotel's own time. Never labelled as paid. */
function DailyPayoutNote({ summary, pendingAmount }: { summary: HotelEarnings["summary"]; pendingAmount: number }) {
  const threshold = Number(summary.threshold);
  const reached = pendingAmount >= threshold;
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="hd-sub" style={{ margin: 0 }}>
        {`Your earnings build up through the day and are checked for payout at ${formatPayoutTime12(summary.payout_time)} (East Africa Time). `}
        {reached
          ? `Your balance has reached the ${whole(threshold)} minimum, so it will be sent at that time.`
          : `If your balance is still below ${whole(threshold)} then, it stays here and is checked again the next day.`}
      </p>
      {summary.auto_hold && (
        <p className="hd-sub" style={{ margin: 0, color: "#ffd68a", fontWeight: 600 }}>
          {HOLD_MESSAGE[summary.auto_hold]}
        </p>
      )}
    </div>
  );
}

/** Explains the automatic-payout rule using the server's real threshold and state. */
function AutoPayoutNote({ summary, pendingAmount }: { summary: HotelEarnings["summary"]; pendingAmount: number }) {
  const threshold = Number(summary.threshold);
  const reached = pendingAmount >= threshold;
  const pct = threshold > 0 ? Math.min(100, (pendingAmount / threshold) * 100) : 100;
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="hd-sub" style={{ margin: 0 }}>
        {reached
          ? `You've reached the ${whole(threshold)} minimum, so your earnings are sent automatically.`
          : `Earnings are sent automatically once they reach ${whole(threshold)}. ${whole(threshold - pendingAmount)} to go.`}
      </p>
      {!reached && (
        <div className="hd-meter" role="img" aria-label={`${Math.round(pct)}% of the ${whole(threshold)} payout minimum`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {summary.auto_hold && (
        <p className="hd-sub" style={{ margin: 0, color: "#ffd68a", fontWeight: 600 }}>
          {HOLD_MESSAGE[summary.auto_hold]}
        </p>
      )}
    </div>
  );
}
