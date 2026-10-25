import React, { useEffect, useState, useCallback } from "react";
import { PayoutMode, formatPayoutTime12, isValidPayoutTime, payoutConfigPayload } from "../../utils/payoutMode";
import { Store, Plus, Pencil, MapPin } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { timeAgo, badgeColorFor } from "../../components/admin/adminFormat";
import { AddHotelModal } from "../../components/admin/AddHotelModal";
import { HotelDetailModal } from "../../components/admin/HotelDetailModal";
import {
  fetchAdminHotels,
  approveHotel,
  suspendHotel,
  updateHotelCommission,
  updateHotelPayoutSettings,
  AdminHotel,
} from "../../services/adminApi";

const STATUS_COLOR: Record<string, string> = {
  active: COLORS.success,
  pending_verification: COLORS.warning,
  suspended: COLORS.danger,
  expired: COLORS.textFaint,
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending_verification: "Pending review",
  suspended: "Suspended",
  expired: "Expired",
};

export default function AdminHotelsScreen() {
  const { authFetch } = useAuth();
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const [commissionDraft, setCommissionDraft] = useState("");
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null);
  const [modeDraft, setModeDraft] = useState<PayoutMode>("instant");
  const [timeDraft, setTimeDraft] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailHotelId, setDetailHotelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const hs = await fetchAdminHotels(authFetch);
      setHotels(hs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load hotels.");
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
    // Blank means "no override": only an explicit override is pre-filled.
    setCommissionDraft(hotel.commission_is_override ? String(Number(hotel.commission_percent)) : "");
  };

  const startEditPayout = (hotel: AdminHotel) => {
    setEditingPayoutId(hotel.id);
    setModeDraft(hotel.payout_mode === "daily" ? "daily" : "instant");
    setTimeDraft(hotel.payout_time ?? "");
  };

  const savePayout = async (hotelId: string) => {
    if (modeDraft === "daily" && !isValidPayoutTime(timeDraft)) {
      setError("Choose a valid daily payout time.");
      return;
    }
    setActingOn(hotelId);
    try {
      await updateHotelPayoutSettings(authFetch, hotelId, payoutConfigPayload(modeDraft, timeDraft));
      setEditingPayoutId(null);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update payout settings.");
    } finally {
      setActingOn(null);
    }
  };

  const saveCommission = async (hotelId: string) => {
    // Blank clears the override (mode default applies); a number sets an explicit one.
    const trimmed = commissionDraft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 30)) {
      setError("Commission must be between 0% and 30%, or blank for the default.");
      return;
    }
    setActingOn(hotelId);
    try {
      await updateHotelCommission(authFetch, hotelId, value);
      setError(null);
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
          <h1 style={styles.title}>Hotels</h1>
          <p style={styles.subtitle}>{hotels.length} partner hotel{hotels.length === 1 ? "" : "s"} registered with MEALVEST.</p>
        </div>
        <button className="mv-action" onClick={() => setShowAddModal(true)} style={styles.addBtn}>
          <Plus size={14} color={COLORS.primary} />
          <span style={styles.addBtnText}>Add hotel</span>
        </button>
      </div>

      {showAddModal && (
        <AddHotelModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}

      {error && <p style={styles.errorText}>{error}</p>}

      {detailHotelId && (
        <HotelDetailModal
          hotelId={detailHotelId}
          onClose={() => setDetailHotelId(null)}
          onRemoved={load}
        />
      )}

      <div style={styles.grid}>
        {hotels.map((item) => (
          <div key={item.id} onClick={() => setDetailHotelId(item.id)} style={{ cursor: "pointer" }}>
          <Card style={styles.hotelCard}>
            <div style={styles.bannerWrap}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={styles.banner} />
              ) : (
                <div style={styles.bannerFallback}>
                  <Store size={24} color={COLORS.textFaint} />
                </div>
              )}
              <span style={{ ...styles.statusBadge, backgroundColor: STATUS_COLOR[item.status] || COLORS.textFaint }}>
                {STATUS_LABEL[item.status] || item.status}
              </span>
              <div style={{ ...styles.initialBadge, backgroundColor: badgeColorFor(item.id) }}>
                <span style={styles.initialBadgeText}>{item.name.trim().charAt(0).toUpperCase()}</span>
              </div>
            </div>

            <div style={styles.cardBody}>
              <span style={styles.hotelName}>{item.name}</span>
              <div style={styles.locationRow}>
                <MapPin size={11} color={COLORS.textMuted} />
                <span style={styles.hotelLocation}>{item.location || "No location set"}</span>
              </div>
              <span style={styles.sinceText}>
                {item.status === "pending_verification" ? "Requested " : "Partner since "}
                {timeAgo(item.created_at)}
              </span>

              {editingCommissionId === item.id ? (
                <div style={styles.commissionEditRow} onClick={(e) => e.stopPropagation()}>
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditCommission(item);
                  }}
                  style={styles.commissionRow}
                >
                  <span style={styles.commissionText}>
                    Commission: {Number(item.commission_percent)}% ({item.commission_is_override ? "override" : "default"})
                  </span>
                  <Pencil size={10} color={COLORS.textFaint} />
                </button>
              )}
              {editingCommissionId === item.id && (
                <span style={{ ...styles.commissionText, display: "block", marginTop: 4 }}>Blank = default for the payout mode (15% instant / 10% daily). Max 30.</span>
              )}

              {editingPayoutId === item.id ? (
                <div style={{ ...styles.commissionEditRow, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                  <select aria-label="Payout mode" value={modeDraft} onChange={(e) => setModeDraft(e.target.value as PayoutMode)} style={{ ...styles.commissionInput, width: "auto" }}>
                    <option value="instant">Instant</option>
                    <option value="daily">Daily</option>
                  </select>
                  {modeDraft === "daily" && <input aria-label="Daily payout time (EAT)" type="time" value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} style={{ ...styles.commissionInput, width: 110 }} />}
                  <button onClick={() => savePayout(item.id)} disabled={actingOn === item.id} style={styles.commissionSaveBtn}>
                    <span style={styles.commissionSaveText}>Save</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditPayout(item);
                  }}
                  style={styles.commissionRow}
                >
                  <span style={styles.commissionText}>Payout: {item.payout_mode === "daily" ? `Daily at ${formatPayoutTime12(item.payout_time)} EAT` : "Instant"}</span>
                  <Pencil size={10} color={COLORS.textFaint} />
                </button>
              )}

              <div style={styles.actionsRow} onClick={(e) => e.stopPropagation()}>
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
            </div>
          </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4 },
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
    flexShrink: 0,
  },
  addBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, paddingBottom: 24 },
  hotelCard: { padding: 0, display: "flex", flexDirection: "column" },
  bannerWrap: { position: "relative", width: "100%", height: 110 },
  banner: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
    display: "block",
  },
  bannerFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.accentSoft,
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: RADIUS.pill,
    padding: "4px 10px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 10,
    color: "#fff",
  },
  initialBadge: {
    position: "absolute",
    left: 12,
    bottom: -14,
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid ${COLORS.card}`,
    boxShadow: "0 2px 6px rgba(29,21,17,0.25)",
  },
  initialBadgeText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: "#fff" },
  cardBody: { padding: 14, paddingTop: 20, display: "flex", flexDirection: "column" },
  hotelName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.text },
  locationRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  hotelLocation: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  sinceText: { display: "block", fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, marginTop: 4 },
  commissionRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  commissionText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  commissionEditRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
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
  actionsRow: { display: "flex", flexDirection: "row", gap: 6, marginTop: 10 },
  actionBtn: { borderRadius: RADIUS.sm, paddingTop: 7, paddingBottom: 7, paddingLeft: 12, paddingRight: 12, flex: 1 },
  actionText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff", display: "block", textAlign: "center" },
};
