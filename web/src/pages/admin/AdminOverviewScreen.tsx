import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ShoppingBag, DollarSign, Wallet, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { timeAgo, formatKsh } from "../../components/admin/adminFormat";
import {
  fetchAdminOverview,
  fetchDailyLedger,
  fetchAdminAlerts,
  fetchTopHotels,
  approveHotel,
  AdminOverview,
  DailyLedger,
  AdminAlerts,
  TopHotel,
} from "../../services/adminApi";

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

export default function AdminOverviewScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [ledger, setLedger] = useState<DailyLedger | null>(null);
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  const [topHotels, setTopHotels] = useState<TopHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, led, al, top] = await Promise.all([
        fetchAdminOverview(authFetch),
        fetchDailyLedger(authFetch),
        fetchAdminAlerts(authFetch),
        fetchTopHotels(authFetch, "today"),
      ]);
      setOverview(ov);
      setLedger(led);
      setAlerts(al);
      setTopHotels(top);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the admin overview.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (hotelId: string) => {
    setActingOn(hotelId);
    try {
      await approveHotel(authFetch, hotelId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve this hotel.");
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

  const needsAttentionCount = alerts?.totalCount ?? 0;
  const maxRevenue = Math.max(1, ...topHotels.map((h) => Number(h.revenue)));

  return (
    <div style={styles.container}>
      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.banner}>
        <div style={styles.bannerTint} />
        <div style={styles.bannerContent}>
          <span style={styles.bannerEyebrow}>PLATFORM OVERVIEW</span>
          <h1 style={styles.bannerTitle}>Mealvest Admin</h1>
          <div style={styles.chipRow}>
            {overview && (
              <span style={styles.chip}>
                <Building2 size={12} color={COLORS.text} /> {overview.hotels.total} hotels
              </span>
            )}
            {needsAttentionCount > 0 ? (
              <span style={{ ...styles.chip, backgroundColor: "#FFE1C7" }}>
                <AlertTriangle size={12} color={COLORS.primaryDark} /> {needsAttentionCount} need attention
              </span>
            ) : (
              <span style={{ ...styles.chip, backgroundColor: COLORS.successSoft }}>
                <CheckCircle2 size={12} color={COLORS.successDark} /> All caught up
              </span>
            )}
          </div>
        </div>
        {ledger && (
          <div style={styles.collectedPill}>
            <span style={styles.collectedLabel}>Collected today</span>
            <span style={styles.collectedValue}>{formatKsh(ledger.plansCollected.amount)}</span>
          </div>
        )}
      </div>

      <div style={styles.statsGrid}>
        {ledger && (
          <StatCard
            icon={<DollarSign size={16} color={COLORS.primary} />}
            label="Revenue today"
            value={formatKsh(ledger.mealsRedeemed.amount)}
            sub={`${ledger.mealsRedeemed.count} meals redeemed`}
          />
        )}
        {overview && (
          <StatCard
            icon={<Building2 size={16} color={COLORS.primary} />}
            label="Partner hotels"
            value={String(overview.hotels.total)}
            sub={Number(overview.hotels.pending) > 0 ? `${overview.hotels.pending} awaiting review` : "All reviewed"}
          />
        )}
        {ledger && (
          <StatCard
            icon={<TrendingUp size={16} color={COLORS.success} />}
            label="Commission today"
            value={formatKsh(ledger.commissionEarned.amount)}
          />
        )}
        {ledger && (
          <StatCard
            icon={<Wallet size={16} color={COLORS.accent} />}
            label="Plans collected"
            value={formatKsh(ledger.plansCollected.amount)}
            sub={`${ledger.plansCollected.count} payments`}
          />
        )}
      </div>

      <div style={styles.twoCol}>
        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <AlertTriangle size={16} color={COLORS.warning} />
            <div>
              <span style={styles.panelTitle}>Needs attention</span>
              <span style={styles.panelSubtitle}>{needsAttentionCount} item{needsAttentionCount === 1 ? "" : "s"} waiting on you</span>
            </div>
          </div>

          {needsAttentionCount === 0 && <p style={styles.emptyText}>Nothing needs attention right now.</p>}

          {alerts?.pendingHotels.map((h) => (
            <div key={h.id} style={styles.attentionRow}>
              <div style={{ flex: 1 }}>
                <span style={styles.attentionName}>{h.name}</span>
                <span style={styles.attentionMeta}>
                  {h.location || "No location set"} · Requested {timeAgo(h.created_at)}
                </span>
              </div>
              <button
                onClick={() => handleApprove(h.id)}
                disabled={actingOn === h.id}
                style={{ ...styles.attentionBtn, backgroundColor: COLORS.success }}
              >
                <span style={styles.attentionBtnText}>Approve</span>
              </button>
            </div>
          ))}

          {alerts?.failedPayments.map((p) => (
            <div key={p.id} style={styles.attentionRow}>
              <div style={{ flex: 1 }}>
                <span style={styles.attentionName}>
                  Failed payment · {p.student_name || p.student_email}
                </span>
                <span style={styles.attentionMeta}>
                  {formatKsh(p.amount)} · {p.hotel_name || "No hotel"} · {timeAgo(p.created_at)}
                </span>
              </div>
              <button onClick={() => navigate("/admin/payments")} style={{ ...styles.attentionBtn, backgroundColor: COLORS.bgDeep }}>
                <span style={styles.attentionBtnText}>Follow up</span>
              </button>
            </div>
          ))}
        </Card>

        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <ShoppingBag size={16} color={COLORS.primary} />
            <div>
              <span style={styles.panelTitle}>Busiest partners today</span>
              <span style={styles.panelSubtitle}>By redeemed order value</span>
            </div>
          </div>

          {topHotels.length === 0 && <p style={styles.emptyText}>No meals have been redeemed yet today.</p>}

          {topHotels.map((h, i) => (
            <div key={h.id} style={styles.topHotelRow}>
              <div style={styles.topHotelHeader}>
                <span style={styles.topHotelRank}>{i + 1}</span>
                <span style={styles.topHotelName}>{h.name}</span>
                <span style={styles.topHotelValue}>{formatKsh(h.revenue)}</span>
              </div>
              <div style={styles.topHotelBarTrack}>
                <div style={{ ...styles.topHotelBarFill, width: `${(Number(h.revenue) / maxRevenue) * 100}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  banner: {
    position: "relative",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    padding: 28,
    marginBottom: 20,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    minHeight: 150,
  },
  bannerTint: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 85% 30%, rgba(255,255,255,0.18), transparent 55%)",
  },
  bannerContent: { position: "relative", display: "flex", flexDirection: "column", gap: 8 },
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
  collectedPill: {
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RADIUS.md,
    padding: "14px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  collectedLabel: { fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.8)" },
  collectedValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: "#fff", marginTop: 2 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
  statCard: { display: "flex", flexDirection: "column", padding: 16 },
  statIcon: { marginBottom: 8 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  statValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, marginTop: 2 },
  statSub: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 4 },
  twoCol: { display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" },
  panelCard: { display: "flex", flexDirection: "column", padding: 18 },
  panelHeaderRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  panelTitle: { display: "block", fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 15, color: COLORS.text },
  panelSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, textAlign: "center", padding: "16px 0" },
  attentionRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  attentionName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  attentionMeta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  attentionBtn: { borderRadius: RADIUS.sm, padding: "7px 12px", flexShrink: 0 },
  attentionBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff" },
  topHotelRow: { marginTop: 12 },
  topHotelHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  topHotelRank: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    color: COLORS.primaryDark,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  topHotelName: { flex: 1, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  topHotelValue: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.primary },
  topHotelBarTrack: { height: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.borderSoft, overflow: "hidden" },
  topHotelBarFill: { height: "100%", borderRadius: RADIUS.pill, background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})` },
};
