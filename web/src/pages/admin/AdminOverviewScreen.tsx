import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, ShoppingBag, DollarSign, Wallet, AlertTriangle, TrendingUp, CheckCircle2, ChevronRight, LogOut, Phone, Megaphone, Trash2 } from "lucide-react";
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
  fetchRevenueAnalytics,
  approveHotel,
  AdminOverview,
  DailyLedger,
  AdminAlerts,
  TopHotel,
  RevenueAnalytics,
} from "../../services/adminApi";
import { fetchCustomerCarePhone, updateCustomerCarePhone } from "../../services/settingsApi";
import {
  fetchAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  AdminAnnouncement,
} from "../../services/announcementsApi";

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

/**
 * Stat-tile trend sparkline per the dataviz skill's figure spec:
 * de-emphasized track, current period in the accent hue, no axes —
 * this is a glance-level trend indicator, not an interactive chart
 * (the full drill-down chart lives on the Analytics tab).
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 160;
  const H = 40;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const points = values.map((v, i) => {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 40, display: "block" }}>
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RevenueTrendBlock({
  label,
  totalRevenue,
  totalCommission,
  values,
}: {
  label: string;
  totalRevenue: number;
  totalCommission: number;
  values: number[];
}) {
  return (
    <div style={styles.trendBlock}>
      <span style={styles.trendBlockLabel}>{label}</span>
      <span style={styles.trendBlockValue}>{formatKsh(totalRevenue)}</span>
      <span style={styles.trendBlockSub}>{formatKsh(totalCommission)} commission</span>
      <div style={styles.trendSparkline}>
        <Sparkline values={values} color={COLORS.primary} />
      </div>
    </div>
  );
}

export default function AdminOverviewScreen() {
  const { authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [ledger, setLedger] = useState<DailyLedger | null>(null);
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  const [topHotels, setTopHotels] = useState<TopHotel[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const [carePhone, setCarePhone] = useState<string | null>(null);
  const [careDraft, setCareDraft] = useState("");
  const [careEditing, setCareEditing] = useState(false);
  const [careSaving, setCareSaving] = useState(false);
  const [careError, setCareError] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementBusyId, setAnnouncementBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, led, al, top, trend, care, ann] = await Promise.all([
        fetchAdminOverview(authFetch),
        fetchDailyLedger(authFetch),
        fetchAdminAlerts(authFetch),
        fetchTopHotels(authFetch, "today"),
        fetchRevenueAnalytics(authFetch, 30),
        fetchCustomerCarePhone(),
        fetchAllAnnouncements(authFetch),
      ]);
      setOverview(ov);
      setLedger(led);
      setAlerts(al);
      setTopHotels(top);
      setRevenueTrend(trend);
      setCarePhone(care);
      setCareDraft(care || "");
      setAnnouncements(ann);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the admin overview.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const postAnnouncement = async () => {
    const message = newAnnouncement.trim();
    if (!message) return;
    setPostingAnnouncement(true);
    setAnnouncementError(null);
    try {
      const created = await createAnnouncement(authFetch, message);
      setAnnouncements((prev) => [created, ...prev]);
      setNewAnnouncement("");
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Could not post the announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const toggleAnnouncementActive = async (a: AdminAnnouncement) => {
    setAnnouncementBusyId(a.id);
    try {
      const updated = await updateAnnouncement(authFetch, a.id, { isActive: !a.is_active });
      setAnnouncements((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Could not update the announcement.");
    } finally {
      setAnnouncementBusyId(null);
    }
  };

  const removeAnnouncement = async (id: string) => {
    if (!window.confirm("Delete this announcement? This can't be undone.")) return;
    setAnnouncementBusyId(id);
    try {
      await deleteAnnouncement(authFetch, id);
      setAnnouncements((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Could not delete the announcement.");
    } finally {
      setAnnouncementBusyId(null);
    }
  };

  const saveCustomerCare = async () => {
    setCareSaving(true);
    setCareError(null);
    try {
      const phone = await updateCustomerCarePhone(authFetch, careDraft.trim());
      setCarePhone(phone);
      setCareDraft(phone);
      setCareEditing(false);
    } catch (err) {
      setCareError(err instanceof Error ? err.message : "Could not update the customer care number.");
    } finally {
      setCareSaving(false);
    }
  };

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

  // Combine both alert kinds into one recency-sorted list and cap the
  // card at 4 rows — the full count still shows in the subtitle above
  // and via "View all orders" below, this just keeps the card compact.
  const visibleAlerts = useMemo(() => {
    if (!alerts) return [];
    const hotels = alerts.pendingHotels.map((h) => ({ kind: "hotel" as const, hotel: h, at: h.created_at }));
    const payments = alerts.failedPayments.map((p) => ({ kind: "payment" as const, payment: p, at: p.created_at }));
    return [...hotels, ...payments].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 4);
  }, [alerts]);

  // Both blocks are derived from the same 30-day fetch — "this week" is
  // just the trailing 7 days of the same series, not a second request.
  const weekTrend = useMemo(() => {
    if (!revenueTrend) return null;
    const last7 = revenueTrend.daily.slice(-7);
    return {
      revenue: last7.reduce((sum, d) => sum + Number(d.gross), 0),
      commission: last7.reduce((sum, d) => sum + Number(d.commission), 0),
      values: last7.map((d) => Number(d.gross)),
    };
  }, [revenueTrend]);

  const monthTrend = useMemo(() => {
    if (!revenueTrend) return null;
    return {
      revenue: revenueTrend.daily.reduce((sum, d) => sum + Number(d.gross), 0),
      commission: revenueTrend.daily.reduce((sum, d) => sum + Number(d.commission), 0),
      values: revenueTrend.daily.map((d) => Number(d.gross)),
    };
  }, [revenueTrend]);

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
        <div style={styles.bannerRightGroup}>
          {ledger && (
            <div style={styles.collectedPill}>
              <span style={styles.collectedLabel}>Collected today</span>
              <span style={styles.collectedValue}>{formatKsh(ledger.plansCollected.amount)}</span>
            </div>
          )}
          <button onClick={() => logout()} style={styles.bannerLogoutBtn} aria-label="Log out">
            <LogOut size={16} color="#fff" />
          </button>
        </div>
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
            icon={<Users size={16} color={COLORS.primary} />}
            label="Students"
            value={String(overview.students)}
            sub="Registered with MEALVEST"
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

      {weekTrend && monthTrend && (
        <Card style={styles.trendCard}>
          <div style={styles.panelHeaderRow}>
            <TrendingUp size={16} color={COLORS.primary} />
            <div>
              <span style={styles.panelTitle}>Revenue trend</span>
              <span style={styles.panelSubtitle}>
                Gross meal revenue, with commission earned · full breakdown on the Analytics tab
              </span>
            </div>
          </div>
          <div style={styles.trendRow}>
            <RevenueTrendBlock label="This week" totalRevenue={weekTrend.revenue} totalCommission={weekTrend.commission} values={weekTrend.values} />
            <div style={styles.trendDivider} />
            <RevenueTrendBlock label="This month" totalRevenue={monthTrend.revenue} totalCommission={monthTrend.commission} values={monthTrend.values} />
          </div>
        </Card>
      )}

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

          {visibleAlerts.map((item) =>
            item.kind === "hotel" ? (
              <div key={`hotel-${item.hotel.id}`} style={styles.attentionRow}>
                <div style={{ flex: 1 }}>
                  <span style={styles.attentionName}>{item.hotel.name}</span>
                  <span style={styles.attentionMeta}>
                    {item.hotel.location || "No location set"} · Requested {timeAgo(item.hotel.created_at)}
                  </span>
                </div>
                <button
                  onClick={() => handleApprove(item.hotel.id)}
                  disabled={actingOn === item.hotel.id}
                  style={{ ...styles.attentionBtn, backgroundColor: COLORS.success }}
                >
                  <span style={styles.attentionBtnText}>Approve</span>
                </button>
              </div>
            ) : (
              <div key={`payment-${item.payment.id}`} style={styles.attentionRow}>
                <div style={{ flex: 1 }}>
                  <span style={styles.attentionName}>
                    Failed payment · {item.payment.student_name || item.payment.student_email}
                  </span>
                  <span style={styles.attentionMeta}>
                    {formatKsh(item.payment.amount)} · {item.payment.hotel_name || "No hotel"} · {timeAgo(item.payment.created_at)}
                  </span>
                </div>
                <button onClick={() => navigate("/admin/payments")} style={{ ...styles.attentionBtn, backgroundColor: COLORS.bgDeep }}>
                  <span style={styles.attentionBtnText}>Follow up</span>
                </button>
              </div>
            )
          )}

          <button onClick={() => navigate("/admin/orders")} style={styles.viewAllRow}>
            <span style={styles.viewAllText}>View all orders</span>
            <ChevronRight size={14} color={COLORS.primary} />
          </button>
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

        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <Phone size={16} color={COLORS.primary} />
            <div>
              <span style={styles.panelTitle}>Customer Care</span>
              <span style={styles.panelSubtitle}>The support number students see across the app</span>
            </div>
          </div>

          {careEditing ? (
            <>
              <input
                style={styles.careInput}
                value={careDraft}
                onChange={(e) => setCareDraft(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                maxLength={10}
                placeholder="0798180082"
                autoFocus
              />
              {careError && <p style={styles.careError}>{careError}</p>}
              <div style={styles.careBtnRow}>
                <button
                  onClick={() => {
                    setCareEditing(false);
                    setCareDraft(carePhone || "");
                    setCareError(null);
                  }}
                  style={styles.careCancelBtn}
                >
                  <span style={styles.careCancelText}>Cancel</span>
                </button>
                <button onClick={saveCustomerCare} disabled={careSaving} style={styles.careSaveBtn}>
                  <span style={styles.careSaveText}>{careSaving ? "Saving…" : "Save"}</span>
                </button>
              </div>
            </>
          ) : (
            <div style={styles.careDisplayRow}>
              <span style={styles.careDisplayValue}>{carePhone || "Not set"}</span>
              <button onClick={() => setCareEditing(true)} style={styles.careEditBtn}>
                <span style={styles.careEditText}>Change</span>
              </button>
            </div>
          )}
        </Card>

        <Card style={styles.panelCard}>
          <div style={styles.panelHeaderRow}>
            <Megaphone size={16} color={COLORS.primary} />
            <div>
              <span style={styles.panelTitle}>Announcements</span>
              <span style={styles.panelSubtitle}>Pops up on every signed-in student and hotel screen</span>
            </div>
          </div>

          <textarea
            style={styles.announcementInput}
            value={newAnnouncement}
            onChange={(e) => setNewAnnouncement(e.target.value)}
            placeholder="Type an announcement to broadcast to everyone…"
            rows={3}
          />
          {announcementError && <p style={styles.careError}>{announcementError}</p>}
          <button
            onClick={postAnnouncement}
            disabled={postingAnnouncement || !newAnnouncement.trim()}
            style={{
              ...styles.careSaveBtn,
              flex: undefined,
              marginTop: 10,
              opacity: postingAnnouncement || !newAnnouncement.trim() ? 0.6 : 1,
            }}
          >
            <span style={styles.careSaveText}>{postingAnnouncement ? "Posting…" : "Post announcement"}</span>
          </button>

          {announcements.length > 0 && (
            <div style={styles.announcementList}>
              {announcements.map((a) => (
                <div key={a.id} style={styles.announcementRow}>
                  <div style={{ flex: 1 }}>
                    <span style={styles.announcementMessage}>{a.message}</span>
                    <span style={styles.attentionMeta}>
                      {a.is_active ? "Active" : "Inactive"} · {timeAgo(a.created_at)}
                    </span>
                  </div>
                  <div style={styles.announcementActions}>
                    <button
                      onClick={() => toggleAnnouncementActive(a)}
                      disabled={announcementBusyId === a.id}
                      style={styles.announcementToggleBtn}
                    >
                      <span style={styles.announcementToggleText}>{a.is_active ? "Deactivate" : "Activate"}</span>
                    </button>
                    <button
                      onClick={() => removeAnnouncement(a.id)}
                      disabled={announcementBusyId === a.id}
                      style={styles.announcementDeleteBtn}
                      aria-label="Delete announcement"
                    >
                      <Trash2 size={14} color={COLORS.danger} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
  bannerRightGroup: { position: "relative", display: "flex", flexDirection: "row", alignItems: "center", gap: 12 },
  collectedPill: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: RADIUS.md,
    padding: "14px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
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
  collectedLabel: { fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.8)" },
  collectedValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: "#fff", marginTop: 2 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
  statCard: { display: "flex", flexDirection: "column", padding: 16 },
  statIcon: { marginBottom: 8 },
  statLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  statValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.text, marginTop: 2 },
  statSub: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 4 },
  trendCard: { display: "flex", flexDirection: "column", padding: 18, marginBottom: 16 },
  trendRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 24 },
  trendDivider: { width: 1, backgroundColor: COLORS.borderSoft, alignSelf: "stretch" },
  trendBlock: { display: "flex", flexDirection: "column", flex: 1, minWidth: 180 },
  trendBlockLabel: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textMuted },
  trendBlockValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.text, marginTop: 4 },
  trendBlockSub: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 2 },
  trendSparkline: { marginTop: 10 },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" },
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
  careDisplayRow: { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  careDisplayValue: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: COLORS.text },
  careEditBtn: { backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "7px 12px" },
  careEditText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
  careInput: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    outline: "none",
    width: "100%",
  },
  careError: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.danger, margin: "6px 0 0 0" },
  careBtnRow: { display: "flex", flexDirection: "row", gap: 8, marginTop: 10 },
  careCancelBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "9px 12px" },
  careCancelText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textMuted, textAlign: "center", display: "block" },
  careSaveBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, padding: "9px 12px" },
  careSaveText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "#fff", textAlign: "center", display: "block" },
  announcementInput: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: "11px 14px",
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.text,
    outline: "none",
    width: "100%",
    resize: "vertical",
  },
  announcementList: { display: "flex", flexDirection: "column", gap: 0, marginTop: 14 },
  announcementRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 0",
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  announcementMessage: { display: "block", fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 13, color: COLORS.text, wordBreak: "break-word" },
  announcementActions: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  announcementToggleBtn: { backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "6px 10px" },
  announcementToggleText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary },
  announcementDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(0,0,0,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
