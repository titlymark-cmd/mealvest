import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, LogOut, ChevronRight, ClipboardList, DollarSign } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelDashboard } from "../../services/hotelStaffApi";

export default function HotelStaffHomeScreen() {
  const { logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelDashboard(authFetch);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <span style={styles.greeting}>Hotel dashboard</span>
          <h1 style={styles.title}>{dashboard?.hotel.name || "—"}</h1>
        </div>
        <button onClick={() => logout()} style={styles.logoutBtn}>
          <LogOut size={16} color={COLORS.danger} />
        </button>
      </div>

      <button onClick={() => navigate("/hotel-staff/scanner")} style={{ width: "100%" }}>
        <div style={styles.scanBtn}>
          <div style={styles.scanIcon}>
            <QrCode size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <span style={styles.scanTitle}>Scan meal QR code</span>
            <span style={styles.scanSubtitle}>Redeem a student's meal</span>
          </div>
          <ChevronRight size={18} color="#fff" />
        </div>
      </button>

      <button onClick={() => navigate("/hotel-staff/orders")} style={styles.linkRow}>
        <ClipboardList size={16} color={COLORS.primary} />
        <span style={styles.linkText}>View all orders</span>
        <ChevronRight size={16} color={COLORS.textFaint} style={{ marginLeft: "auto" }} />
      </button>

      {loading && (
        <div style={{ marginTop: 20, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}

      {!loading && dashboard && (
        <>
          <div style={styles.statsRow}>
            <Card style={styles.statCard}>
              <ClipboardList size={16} color={COLORS.primary} />
              <span style={styles.statLabel}>Redeemed today</span>
              <span style={styles.statValue}>{dashboard.stats.redeemed_orders}</span>
            </Card>
            <Card style={styles.statCard}>
              <DollarSign size={16} color={COLORS.success} />
              <span style={styles.statLabel}>Revenue</span>
              <span style={styles.statValue}>KSh {Number(dashboard.stats.gross_revenue).toLocaleString()}</span>
            </Card>
          </div>
          <div style={styles.statsRow}>
            <Card style={styles.statCard}>
              <span style={styles.statLabel}>Pending orders</span>
              <span style={styles.statValue}>{dashboard.stats.pending_orders}</span>
            </Card>
            <Card style={styles.statCard}>
              <span style={styles.statLabel}>Net earnings</span>
              <span style={styles.statValue}>KSh {Number(dashboard.stats.net_earnings).toLocaleString()}</span>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, paddingBottom: 40, display: "flex", flexDirection: "column" },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0, marginTop: 2 },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: "rgba(252,244,234,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scanBtn: { display: "flex", flexDirection: "row", alignItems: "center", gap: 12, borderRadius: RADIUS.lg, padding: 16, marginTop: 18, marginBottom: 18, background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})` },
  scanIcon: { width: 42, height: 42, borderRadius: RADIUS.md, backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  scanTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: "#fff" },
  scanSubtitle: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.85)" },
  linkRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: 14,
    marginBottom: 16,
    width: "100%",
  },
  linkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  statsRow: { display: "flex", flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1, display: "flex", flexDirection: "column" },
  statLabel: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 8 },
  statValue: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 15, color: COLORS.text, marginTop: 2 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginTop: 20, textAlign: "center" },
};
