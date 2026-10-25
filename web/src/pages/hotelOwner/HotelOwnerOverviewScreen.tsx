import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  QrCode,
  Wallet,
  ShoppingBag,
  ClipboardList,
  TrendingUp,
  UtensilsCrossed,
  MapPin,
  PackageCheck,
  Landmark,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { timeAgo } from "../../components/shared/format";
import { payoutScheduleLabel } from "../../utils/payoutMode";
import { SkeletonRegion, SkeletonStats, SkeletonChart, SkeletonList } from "../../components/ui/Skeleton";
import {
  Banner,
  Panel,
  PanelHead,
  PageHeader,
  StatTile,
  StatusPill,
  HOTEL_STATUS,
  VERIFICATION_STATUS,
  formatDate,
  itemsSummary,
  orderCode,
  useNotice,
  whole,
} from "../../components/hotel/hd";
import {
  fetchHotelDashboard,
  fetchHotelWeeklyRevenue,
  fetchHotelOrders,
  fetchOwnMenu,
  markOrderReady,
  HotelDashboard,
  HotelMenuItem,
  HotelOrder,
  WeeklyRevenueDay,
} from "../../services/hotelStaffApi";

const REFRESH_MS = 30_000;
const MAX_ROWS = 4;

function daysUntil(isoDate: string): number {
  const end = new Date(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function shortAmount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(Math.round(n));
}

export default function HotelOwnerOverviewScreen() {
  const { authFetch } = useAuth();
  const { notice, notify } = useNotice();

  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [week, setWeek] = useState<WeeklyRevenueDay[]>([]);
  const [preparing, setPreparing] = useState<HotelOrder[]>([]);
  const [ready, setReady] = useState<HotelOrder[]>([]);
  const [menu, setMenu] = useState<HotelMenuItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  // `silent` refreshes (the 30s poll) never blank the page or replace good data with an error.
  const load = useCallback(
    async (silent = false) => {
      try {
        const [dash, days, paid, rdy, items] = await Promise.all([
          fetchHotelDashboard(authFetch),
          fetchHotelWeeklyRevenue(authFetch),
          fetchHotelOrders(authFetch, "paid"),
          fetchHotelOrders(authFetch, "ready"),
          fetchOwnMenu(authFetch).catch(() => null), // secondary: never block the dashboard on the menu
        ]);
        setDashboard(dash);
        setWeek(days);
        setPreparing(paid);
        setReady(rdy);
        setMenu(items);
        setError(null);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Could not load your dashboard.");
      } finally {
        setLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    load();
    const id = window.setInterval(() => {
      if (!document.hidden) load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const handleMarkReady = async (order: HotelOrder) => {
    setActingOn(order.id);
    try {
      await markOrderReady(authFetch, order.id);
      notify(`${orderCode(order.id)} marked ready for pickup.`);
      await load(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update this order.", "bad");
    } finally {
      setActingOn(null);
    }
  };

  const weekValues = useMemo(() => week.map((d) => Number(d.revenue)), [week]);
  const weekTotal = weekValues.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(1, ...weekValues);
  // The API returns the trailing 7 days oldest-first, ending today. Labelling by position avoids
  // re-parsing a DATE the server serialises as a timezone-dependent timestamp.
  const dayLabels = useMemo(
    () =>
      week.map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (week.length - 1 - i));
        return d.toLocaleDateString("en-KE", { weekday: "short" });
      }),
    [week]
  );
  const bestIndex = weekTotal > 0 ? weekValues.indexOf(Math.max(...weekValues)) : -1;
  const chartLabel = week.length
    ? `Revenue by day this week. ${weekValues.map((v, i) => `${dayLabels[i]} ${whole(v)}`).join(", ")}.`
    : "No revenue data";

  if (loading) {
    return (
      <div className="hd-page mv-page">
        <SkeletonRegion label="dashboard">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SkeletonStats count={4} />
            <SkeletonChart h={150} />
            <SkeletonList rows={3} thumb="none" />
          </div>
        </SkeletonRegion>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="hd-page">
        <PageHeader eyebrow="Hotel dashboard" title="Overview" />
        <Banner tone="bad" title="We couldn't load your dashboard" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>}>
          {error ?? "Please check your connection and try again."}
        </Banner>
      </div>
    );
  }

  const { hotel, stats } = dashboard;
  const place = hotel.location || hotel.address;
  const statusMeta = HOTEL_STATUS[hotel.status] ?? { label: hotel.status, tone: "muted" as const };
  const verification = hotel.payment_verification_status;
  const contractDays = hotel.contract_end_date ? daysUntil(hotel.contract_end_date) : null;
  const visibleMeals = menu ? menu.filter((m) => m.available).length : null;
  const hiddenMeals = menu ? menu.length - (visibleMeals ?? 0) : 0;
  const pendingCount = Number(stats.pending_orders);
  const waiting = preparing.slice(0, MAX_ROWS);
  const pickup = ready.slice(0, MAX_ROWS);

  return (
    <div className="hd-page mv-page">
      <PageHeader
        eyebrow="Hotel dashboard"
        title={hotel.name || "Your hotel"}
        subtitle={
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" }}>
            <StatusPill tone={statusMeta.tone} onDark>
              {statusMeta.label}
            </StatusPill>
            {place && (
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                <MapPin size={13} aria-hidden="true" /> {place}
              </span>
            )}
            {visibleMeals !== null && (
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                <UtensilsCrossed size={13} aria-hidden="true" /> {visibleMeals} of {menu!.length} meals visible
              </span>
            )}
          </span>
        }
        actions={
          <Link to="/hotel-owner/scanner" className="hd-btn hd-btn-primary">
            <QrCode size={18} aria-hidden="true" /> Scan QR
          </Link>
        }
      />

      {error && <Banner tone="bad" title="Some information may be out of date">{error}</Banner>}

      {verification && verification !== "verified" && (
        <Banner
          tone={verification === "pending" ? "warn" : "bad"}
          title={`Settlement details: ${(VERIFICATION_STATUS[verification]?.label ?? verification).toLowerCase()}`}
          action={
            <Link to="/hotel-owner/profile" className="hd-btn hd-btn-dark hd-btn-sm">
              Review
            </Link>
          }
        >
          {verification === "pending"
            ? "MEALVEST is still verifying where your payouts are sent."
            : "Check your payout details so settlements can reach you."}
        </Banner>
      )}

      {contractDays !== null && contractDays <= 30 && (
        <Banner tone={contractDays < 0 ? "bad" : "warn"} title={contractDays < 0 ? "Your contract has ended" : `Your contract ends in ${contractDays} day${contractDays === 1 ? "" : "s"}`}>
          Contract end date: {formatDate(hotel.contract_end_date)}.
        </Banner>
      )}

      {menu && menu.length === 0 && (
        <Banner
          title="Your menu is empty"
          action={
            <Link to="/hotel-owner/menu" className="hd-btn hd-btn-dark hd-btn-sm">
              Add a meal
            </Link>
          }
        >
          Students can't order until you list at least one meal.
        </Banner>
      )}

      <section className="hd-stats" aria-label="Today at a glance">
        <StatTile icon={<Wallet size={17} color="#c93a22" />} label="Revenue today" value={whole(stats.revenue_today)} sub={`${stats.today_orders} order${Number(stats.today_orders) === 1 ? "" : "s"} today`} />
        <StatTile
          icon={<ShoppingBag size={17} color="#8f5600" />}
          label="Preparing now"
          value={String(pendingCount)}
          sub={pendingCount > 0 ? "Waiting on you" : "All caught up"}
        />
        <StatTile
          icon={<PackageCheck size={17} color="#3f7d2c" />}
          label="Meals redeemed"
          value={String(Number(stats.redeemed_orders))}
          sub={stats.cancelled_orders !== undefined ? `${Number(stats.cancelled_orders)} cancelled` : undefined}
        />
        <StatTile
          icon={<TrendingUp size={17} color="#c93a22" />}
          label="Total earned"
          value={whole(stats.net_earnings)}
          sub={hotel.payout_mode || hotel.settlement_schedule ? `Payout: ${payoutScheduleLabel(hotel)}` : undefined}
        />
      </section>

      <div className="hd-grid-2">
        <Panel aria-label="Revenue this week">
          <PanelHead
            icon={<TrendingUp size={18} color="#c93a22" aria-hidden="true" />}
            title="This week"
            subtitle={
              <>
                {whole(weekTotal)} earned
                {bestIndex >= 0 ? ` · best day ${dayLabels[bestIndex]}` : ""}
              </>
            }
          />
          {weekTotal === 0 ? (
            <div className="hd-well" style={{ textAlign: "center", fontSize: 13, color: "#6b625c" }}>
              No redeemed meals in the last 7 days yet. Revenue appears here as students collect their meals.
            </div>
          ) : (
            <div className="hd-chart" role="img" aria-label={chartLabel}>
              {weekValues.map((v, i) => {
                const today = i === weekValues.length - 1;
                return (
                  <div className="hd-bar-col" key={i} aria-hidden="true">
                    <span className="hd-bar-val">{v > 0 ? shortAmount(v) : ""}</span>
                    <div className="hd-bar-track">
                      <div className="hd-bar-fill" data-today={today} style={{ height: `${Math.max(v > 0 ? 6 : 0, (v / maxDay) * 100)}%` }} />
                    </div>
                    <span className="hd-bar-day" data-today={today}>
                      {today ? "Today" : dayLabels[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel aria-label="Orders to action">
          <PanelHead
            icon={<ClipboardList size={18} color="#8f5600" aria-hidden="true" />}
            title="Orders to action"
            subtitle={`${preparing.length} preparing · ${ready.length} ready for pickup`}
            right={
              <Link to="/hotel-owner/orders" className="hd-btn hd-btn-quiet hd-btn-sm">
                All orders
              </Link>
            }
          />
          {preparing.length === 0 && ready.length === 0 ? (
            <div className="hd-well" style={{ textAlign: "center", fontSize: 13, color: "#6b625c" }}>
              Nothing waiting on you right now.
            </div>
          ) : (
            <div className="hd-list">
              {waiting.map((o) => (
                <div className="hd-row" key={o.id}>
                  <div className="hd-row-main">
                    <span className="hd-row-title">{itemsSummary(o.items)}</span>
                    <span className="hd-row-meta">
                      {orderCode(o.id)}
                      {o.student_name ? ` · ${o.student_name}` : ""} · {timeAgo(o.created_at)}
                    </span>
                  </div>
                  <button className="hd-btn hd-btn-primary hd-btn-sm" disabled={actingOn === o.id} onClick={() => handleMarkReady(o)}>
                    {actingOn === o.id ? "Saving…" : "Mark ready"}
                  </button>
                </div>
              ))}
              {preparing.length > MAX_ROWS && <p className="hd-panel-sub" style={{ padding: "10px 0 0" }}>+{preparing.length - MAX_ROWS} more preparing</p>}
              {pickup.map((o) => (
                <div className="hd-row" key={o.id}>
                  <div className="hd-row-main">
                    <span className="hd-row-title">{itemsSummary(o.items)}</span>
                    <span className="hd-row-meta">
                      {orderCode(o.id)}
                      {o.student_name ? ` · ${o.student_name}` : ""} · {timeAgo(o.created_at)}
                    </span>
                  </div>
                  <StatusPill tone="ready">Ready</StatusPill>
                </div>
              ))}
              {ready.length > 0 && <p className="hd-panel-sub" style={{ padding: "10px 0 0" }}>Scan the student's QR code to hand over a ready meal.</p>}
            </div>
          )}
        </Panel>
      </div>

      <nav className="hd-stats" aria-label="Shortcuts" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Link to="/hotel-owner/menu" className="hd-shortcut">
          <UtensilsCrossed size={18} color="#c93a22" aria-hidden="true" /> Manage menu
          {hiddenMeals > 0 && <StatusPill tone="warn">{hiddenMeals} hidden</StatusPill>}
        </Link>
        <Link to="/hotel-owner/earnings" className="hd-shortcut">
          <Landmark size={18} color="#c93a22" aria-hidden="true" /> Earnings &amp; payouts
        </Link>
        <Link to="/hotel-owner/students" className="hd-shortcut">
          <Users size={18} color="#c93a22" aria-hidden="true" /> Students
        </Link>
      </nav>

      {notice}
    </div>
  );
}
