import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Building2, Users, ShoppingBag, DollarSign, Plus, Pencil } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import {
  fetchAdminOverview,
  fetchAdminHotels,
  approveHotel,
  suspendHotel,
  updateHotelCommission,
  AdminOverview,
  AdminHotel,
} from "../../services/adminApi";

const STATUS_COLOR: Record<string, string> = {
  active: COLORS.success,
  pending_verification: COLORS.warning,
  suspended: COLORS.danger,
  expired: COLORS.textFaint,
};

export default function AdminHomeScreen() {
  const { logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const [commissionDraft, setCommissionDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, hs] = await Promise.all([fetchAdminOverview(authFetch), fetchAdminHotels(authFetch)]);
      setOverview(ov);
      setHotels(hs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin data.");
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

  const handleSuspend = async (hotelId: string) => {
    setActingOn(hotelId);
    try {
      await suspendHotel(authFetch, hotelId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suspend this hotel.");
    } finally {
      setActingOn(null);
    }
  };

  const startEditCommission = (hotel: AdminHotel) => {
    setEditingCommissionId(hotel.id);
    setCommissionDraft(hotel.commission_percent);
  };

  const saveCommission = async (hotelId: string) => {
    const value = Number(commissionDraft);
    if (!value && value !== 0) return;
    setActingOn(hotelId);
    try {
      await updateHotelCommission(authFetch, hotelId, value);
      setEditingCommissionId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update commission.");
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
      <div style={styles.headerRow}>
        <div>
          <span style={styles.greeting}>Platform overview</span>
          <h1 style={styles.title}>Mealvest Admin</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
          <button className="mv-action" onClick={() => navigate("/admin/create-hotel")} style={styles.addBtn}>
            <Plus size={14} color={COLORS.primary} />
            <span style={styles.addBtnText}>Add hotel</span>
          </button>
          <button onClick={() => logout()} style={styles.logoutBtn}>
            <LogOut size={16} color={COLORS.danger} />
          </button>
        </div>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {overview && (
        <>
          <div style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Building2 size={16} color={COLORS.primary} />
              <span style={styles.statLabel}>Hotels</span>
              <span style={styles.statValue}>{overview.hotels.total}</span>
            </Card>
            <Card style={styles.statCard}>
              <Users size={16} color={COLORS.primary} />
              <span style={styles.statLabel}>Students</span>
              <span style={styles.statValue}>{overview.students}</span>
            </Card>
          </div>
          <div style={styles.statsRow}>
            <Card style={styles.statCard}>
              <ShoppingBag size={16} color={COLORS.warning} />
              <span style={styles.statLabel}>Orders today</span>
              <span style={styles.statValue}>{overview.orders.today}</span>
            </Card>
            <Card style={styles.statCard}>
              <DollarSign size={16} color={COLORS.success} />
              <span style={styles.statLabel}>Commission earned</span>
              <span style={styles.statValue}>KSh {Number(overview.orders.mealvest_commission).toLocaleString()}</span>
            </Card>
          </div>
        </>
      )}

      <h2 style={styles.sectionTitle}>Hotels</h2>
      <div style={styles.list}>
        {hotels.map((item) => (
          <Card key={item.id} style={styles.hotelCard}>
            <div style={{ flex: 1 }}>
              <span style={styles.hotelName}>{item.name}</span>
              <span style={{ ...styles.hotelStatus, color: STATUS_COLOR[item.status] || COLORS.textFaint }}>
                {item.status.replace("_", " ")}
              </span>
              {editingCommissionId === item.id ? (
                <div style={styles.commissionEditRow}>
                  <input
                    style={styles.commissionInput}
                    value={commissionDraft}
                    onChange={(e) => setCommissionDraft(e.target.value)}
                    inputMode="numeric"
                    autoFocus
                  />
                  <button onClick={() => saveCommission(item.id)} style={styles.commissionSaveBtn}>
                    <span style={styles.commissionSaveText}>Save</span>
                  </button>
                </div>
              ) : (
                <button onClick={() => startEditCommission(item)} style={styles.commissionRow}>
                  <span style={styles.commissionText}>Commission: {item.commission_percent}%</span>
                  <Pencil size={10} color={COLORS.textFaint} />
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {item.status === "pending_verification" && (
                <button
                  onClick={() => handleApprove(item.id)}
                  disabled={actingOn === item.id}
                  style={{ ...styles.actionBtn, backgroundColor: COLORS.success }}
                >
                  <span style={styles.actionText}>Approve</span>
                </button>
              )}
              {item.status === "active" && (
                <button
                  onClick={() => handleSuspend(item.id)}
                  disabled={actingOn === item.id}
                  style={{ ...styles.actionBtn, backgroundColor: COLORS.danger }}
                >
                  <span style={styles.actionText}>Suspend</span>
                </button>
              )}
              {item.status === "suspended" && (
                <button
                  onClick={() => handleApprove(item.id)}
                  disabled={actingOn === item.id}
                  style={{ ...styles.actionBtn, backgroundColor: COLORS.success }}
                >
                  <span style={styles.actionText}>Reactivate</span>
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  center: { flexShrink: 0, width: "100%", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
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
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12, textAlign: "center" },
  statsRow: { display: "flex", flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1, display: "flex", flexDirection: "column" },
  statLabel: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 8 },
  statValue: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 15, color: COLORS.text, marginTop: 2 },
  sectionTitle: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 15, color: COLORS.textOnDark, margin: 0, marginTop: 16, marginBottom: 10 },
  list: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24 },
  hotelCard: { display: "flex", flexDirection: "row", alignItems: "center", padding: 12 },
  hotelName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  hotelStatus: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  actionBtn: { borderRadius: RADIUS.sm, paddingTop: 7, paddingBottom: 7, paddingLeft: 12, paddingRight: 12 },
  actionText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff" },
  addBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(252,244,234,0.08)",
    borderRadius: RADIUS.sm,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
  },
  addBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
  commissionRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  commissionText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  commissionEditRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  commissionInput: {
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.text,
    width: 50,
    outline: "none",
  },
  commissionSaveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10 },
  commissionSaveText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10, color: "#fff" },
};
