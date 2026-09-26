import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  QrCode,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Wallet,
  MapPin,
  UtensilsCrossed,
  ChevronRight,
  LogOut,
  ClipboardList,
} from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { formatKsh, timeAgo } from "../../components/shared/format";
import {
  fetchHotelDashboard,
  fetchHotelWeeklyRevenue,
  fetchHotelOrders,
  markOrderReady,
  HotelDashboard,
  WeeklyRevenueDay,
  HotelOrder,
} from "../../services/hotelStaffApi";

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
      {sub && <span style={styles.statSub}>{sub}</span>}
    </Card>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function HotelOwnerOverviewScreen() {
  const { authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [week, setWeek] = useState<WeeklyRevenueDay[]>([]);
  const [pendingOrders, setPendingOrders] = useState<HotelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [dash, w, orders] = await Promise.all([
        fetchHotelDashboard(authFetch),
        fetchHotelWeeklyRevenue(authFetch),
        fetchHotelOrders(authFetch, "paid"),
      ]);
      setDashboard(dash);
      setWeek(w);
      setPendingOrders(orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkReady = async (orderId: string) => {
    setActingOn(orderId);
    try {
      await markOrderReady(authFetch, orderId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this order.");
    } finally {
      setActingOn(null);
    }
  };

  const weekTotal = useMemo(() => week.reduce((sum, d) => sum + Number(d.revenue), 0), [week]);
  const maxDay = Math.max(1, ...week.map((d) => Number(d.revenue)));
  const bestDayLabel = useMemo(() => {
    if (week.length === 0) return null;
    const best = week.reduce((a, b) => (Number(b.revenue) > Number(a.revenue) ? b : a));
    return DAY_LABELS[new Date(best.day).getUTCDay()];
  }, [week]);

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  const commissionPercent = Number(dashboard?.hotel.commission_percent || 0);
  const visiblePending = pendingOrders.slice(0, 4);

  return (
    <div style={styles.container}>
      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.banner}>
        <div style={styles.bannerTint} />
        <div style={styles.bannerContent}>
          <span style={styles.bannerEyebrow}>HOTEL DASHBOARD</span>
          <h1 style={styles.bannerTitle}>{dashboard?.hotel.name || "—"}</h1>
          <div style={styles.chipRow}>
            {(dashboard?.hotel.location || dashboard?.hotel.address) && (
              <span style={styles.chip}>
                <MapPin size={12} color={COLORS.text} /> {dashboard.hotel.location || dashboard.hotel.address}
              </span>
            )}
            {dashboard && (
              <span style={styles.chip}>
                <UtensilsCrossed size={12} color={COLORS.text} /> {dashboard.stats.menu_item_count} meals listed
              </span>
            )}
          </div>
        </div>

        <div style={styles.bannerRightGroup}>
          <button className="mv-action" onClick={() => navigate("/hotel-owner/scanner")} style={styles.scanPill}>
            <div style={styles.scanIcon}>
              <QrCode size={18} color="#fff" />
            </div>
            <div style={{ textAlign: "left" }}>
              <span style={styles.scanTitle}>Scan QR code</span>
              <span style={styles.scanSubtitle}>Redeem a meal</span>
            </div>
          </button>
          <button onClick={() => logout()} style={styles.bannerLogoutBtn} aria-label="Log out">
            <LogOut size={16} color="#fff" />
          </button>
        </div>
      </div>

      <div style={styles.statsGrid}>
        {dashboard && (
          <StatCard
            icon={<DollarSign size={16} color={COLORS.primary} />}
            label="Revenue today"
            value={formatKsh(dashboard.stats.revenue_today)}
            sub={`${dashboard.stats.today_orders} orders in`}
          />
        )}
        {dashboard && (
          <StatCard
            icon={<ShoppingBag size={16} color={COLORS.warning} />}
            label="Active orders"
            value={String(dashboard.stats.pending_orders)}
            sub={Number(dashboard.stats.pending_orders) > 0 ? "Needs your action" : "All caught up"}
          />
        )}
        {dashboard && (
          <StatCard
            icon={<Wallet size={16} color={COLORS.accent} />}
            label="Commission owed"
            value={formatKsh(dashboard.stats.commission_owed)}
            sub={`${dashboard.hotel.commission_percent}% platform fee`}
          />
        )}
        {dashboard && (
          <StatCard
            icon={<TrendingUp size={16} color={COLORS.success} />}
            label="Net payout"
            value={formatKsh(dashboard.stats.net_earnings)}
            sub={dashboard.hotel.settlement_schedule || undefined}
          />
        )}
      </div>

      <div style={styles.twoCol}>
        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <TrendingUp size={16} color={COLORS.primary} />
            <div>
              <span style={styles.panelTitle}>This week</span>
              <span style={styles.panelSubtitle}>
                {formatKsh(weekTotal)}
                {bestDayLabel ? ` · best day ${bestDayLabel}` : ""}
              </span>
            </div>
          </div>

          <div style={styles.chartRow}>
            {week.map((d) => (
              <div key={d.day} style={styles.barCol}>
                <span style={styles.barValue}>{Number(d.revenue) >= 1000 ? `${(Number(d.revenue) / 1000).toFixed(1)}k` : Number(d.revenue)}</span>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      height: `${Math.max(4, (Number(d.revenue) / maxDay) * 100)}%`,
                      background: Number(d.revenue) === maxDay && maxDay > 1 ? COLORS.primary : COLORS.accentSoft,
                    }}
                  />
                </div>
                <span style={styles.barLabel}>{DAY_LABELS[new Date(d.day).getUTCDay()]}</span>
              </div>
            ))}
          </div>

          <div style={styles.chartFooterRow}>
            <span style={styles.chartFooterLabel}>Gross sales</span>
            <span style={styles.chartFooterValue}>{formatKsh(weekTotal)}</span>
          </div>
          <div style={styles.chartFooterRow}>
            <span style={styles.chartFooterLabel}>Platform fee ({commissionPercent}%)</span>
            <span style={styles.chartFooterValue}>{formatKsh((weekTotal * commissionPercent) / 100)}</span>
          </div>
        </Card>

        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <ClipboardList size={16} color={COLORS.warning} />
            <div>
              <span style={styles.panelTitle}>Needs attention</span>
              <span style={styles.panelSubtitle}>{pendingOrders.length} order{pendingOrders.length === 1 ? "" : "s"} awaiting prep</span>
            </div>
          </div>

          {pendingOrders.length === 0 && <p style={styles.emptyText}>No orders waiting on you right now.</p>}

          {visiblePending.map((o) => (
            <div key={o.id} style={styles.attentionRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.attentionName}>{o.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}</span>
                <span style={styles.attentionMeta}>
                  {formatKsh(o.amount)} · {timeAgo(o.created_at)}
                </span>
              </div>
              <button
                onClick={() => handleMarkReady(o.id)}
                disabled={actingOn === o.id}
                style={{ ...styles.attentionBtn, backgroundColor: COLORS.success }}
              >
                <span style={styles.attentionBtnText}>Mark Ready</span>
              </button>
            </div>
          ))}

          <button onClick={() => navigate("/hotel-owner/orders")} style={styles.viewAllRow}>
            <span style={styles.viewAllText}>View all orders</span>
            <ChevronRight size={14} color={COLORS.primary} />
          </button>
        </Card>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  banner: {
    position: "relative",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    padding: 28,
    marginBottom: 20,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    minHeight: 150,
  },
  bannerTint: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 85% 30%, rgba(255,255,255,0.18), transparent 55%)",
  },
  bannerContent: { position: "relative", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  bannerEyebrow: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: 1 },
  bannerTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 28, color: "#fff", margin: 0 },
  chipRow: { display: "flex", flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  chip: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    borderRadius: RADIUS.pill,
    padding: "6px 12px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 12,
    color: COLORS.text,
  },
  bannerRightGroup: { position: "relative", display: "flex", flexDirection: "row", alignItems: "center", gap: 12 },
  scanPill: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RADIUS.md,
    padding: "10px 18px",
  },
  scanIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  scanTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: "#fff" },
  scanSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.85)" },
  bannerLogoutBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
  statCard: { display: "flex", flexDirection: "column", padding: 16 },
  statIcon: { marginBottom: 8 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  statValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, marginTop: 2 },
  statSub: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 4 },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" },
  panelCard: { display: "flex", flexDirection: "column", padding: 18 },
  panelHeaderRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  panelTitle: { display: "block", fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  panelSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "16px 0" },
  chartRow: { display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, height: 130, marginBottom: 4 },
  barCol: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end", gap: 4 },
  barValue: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: COLORS.textMuted },
  barTrack: { width: "100%", flex: 1, display: "flex", alignItems: "flex-end", maxWidth: 28 },
  barFill: { width: "100%", borderRadius: 6, minHeight: 4 },
  barLabel: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, marginTop: 2 },
  chartFooterRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    marginTop: 10,
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  chartFooterLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  chartFooterValue: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.text },
  attentionRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  attentionName: {
    display: "block",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
    color: COLORS.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  attentionMeta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  attentionBtn: { borderRadius: RADIUS.sm, padding: "7px 12px", flexShrink: 0 },
  attentionBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff", whiteSpace: "nowrap" },
  viewAllRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px solid ${COLORS.borderSoft}`,
    width: "100%",
  },
  viewAllText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
};
