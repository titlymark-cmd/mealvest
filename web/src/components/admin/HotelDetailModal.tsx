import React, { useEffect, useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { Spinner } from "../Spinner";
import { formatKsh } from "./adminFormat";
import { fetchHotelDetail, deleteHotel, HotelDetail } from "../../services/adminApi";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending_verification: "Pending review",
  suspended: "Suspended",
  expired: "Expired",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

export function HotelDetailModal({
  hotelId,
  onClose,
  onRemoved,
}: {
  hotelId: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { authFetch } = useAuth();
  const [data, setData] = useState<HotelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    fetchHotelDetail(authFetch, hotelId)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Could not load this hotel."));
    return () => {
      active = false;
    };
  }, [authFetch, hotelId]);

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await deleteHotel(authFetch, hotelId);
      onRemoved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this hotel.");
      setConfirming(false);
    } finally {
      setRemoving(false);
    }
  };

  const h = data?.hotel;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <h2 style={styles.title}>{h?.name || "Hotel"}</h2>
            <span style={styles.subtitle}>
              {h ? STATUS_LABEL[h.status] || h.status : "Hotel profile"}
            </span>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            <X size={18} color={COLORS.textMuted} />
          </button>
        </div>

        <div style={styles.body}>
          {error && <p style={styles.errorText}>{error}</p>}
          {!data && !error && (
            <div style={styles.center}>
              <Spinner color={COLORS.primary} />
            </div>
          )}

          {data && h && (
            <>
              <span style={styles.sectionLabel}>Business</span>
              <Row label="Type" value={<span style={{ textTransform: "capitalize" }}>{(h.business_type || "—").replace("_", " ")}</span>} />
              <Row label="Location" value={h.location || "—"} />
              <Row label="Address" value={h.address || "—"} />
              <Row label="Phone" value={h.contact_phone || "—"} />
              <Row label="Email" value={h.contact_email || "—"} />
              <Row label="Registered" value={fmtDate(h.created_at)} />

              <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Owner</span>
              <Row label="Contact name" value={data.owner?.full_name || h.owner_contact_name || "—"} />
              <Row label="Owner email" value={data.owner?.email || "—"} />
              <Row label="Owner phone" value={data.owner?.phone_number || "—"} />
              <Row label="Login username" value={h.admin_username || "—"} />

              <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Commercial</span>
              <Row label="Settlement method" value={<span style={{ textTransform: "capitalize" }}>{(h.payment_method || "—").replace(/_/g, " ")}</span>} />
              <Row label="Registration fee" value={formatKsh(h.registration_fee)} />
              <Row label="Commission" value={`${h.commission_percent}%`} />
              <Row label="Loyalty incentive" value={`${h.loyalty_incentive_percent}%`} />
              <Row label="Contract" value={`${fmtDate(h.contract_start_date)} → ${fmtDate(h.contract_end_date)}`} />
              <Row label="Terms accepted" value={h.terms_accepted ? fmtDate(h.terms_accepted_at) : "No"} />

              <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Activity</span>
              <Row label="Total orders" value={data.stats.total_orders} />
              <Row label="Meals redeemed" value={data.stats.redeemed_orders} />
              <Row label="Gross redeemed" value={formatKsh(data.stats.gross_redeemed)} />
              <Row label="Staff" value={data.counts.staff_count} />
              <Row label="Menu items" value={data.counts.menu_count} />

              {/* Danger zone */}
              <div style={styles.dangerZone}>
                {data.removable ? (
                  confirming ? (
                    <>
                      <p style={styles.confirmText}>
                        Permanently remove <strong>{h.name}</strong> and its owner/staff logins? This can't be undone.
                      </p>
                      <div style={styles.confirmRow}>
                        <button style={styles.cancelBtn} onClick={() => setConfirming(false)} disabled={removing}>
                          <span style={styles.cancelText}>Cancel</span>
                        </button>
                        <button style={styles.confirmRemoveBtn} onClick={handleRemove} disabled={removing}>
                          <span style={styles.removeText}>{removing ? "Removing…" : "Yes, remove"}</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <button style={styles.removeBtn} onClick={() => setConfirming(true)}>
                      <Trash2 size={14} color="#fff" />
                      <span style={styles.removeText}>Remove hotel</span>
                    </button>
                  )
                ) : (
                  <div style={styles.cantRemove}>
                    <AlertTriangle size={14} color={COLORS.warning} />
                    <span style={styles.cantRemoveText}>
                      Has order/payout history — suspend it instead to keep records intact.
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(29,21,17,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 200,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    width: "100%",
    maxWidth: 460,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "22px 24px 0 24px",
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 18, color: COLORS.text, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(44,22,16,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: "none",
    cursor: "pointer",
  },
  body: { padding: 24, display: "flex", flexDirection: "column" },
  center: { display: "flex", justifyContent: "center", padding: 30 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 8 },
  sectionLabel: {
    display: "block",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.textFaint,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 16,
    padding: "6px 0",
    borderBottom: `1px solid ${COLORS.borderSoft}`,
  },
  rowLabel: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, flexShrink: 0 },
  rowValue: {
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    fontSize: 13,
    color: COLORS.text,
    textAlign: "right",
    wordBreak: "break-word",
  },
  dangerZone: {
    marginTop: 22,
    paddingTop: 18,
    borderTop: `1px solid ${COLORS.borderSoft}`,
  },
  removeBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    padding: "11px 12px",
    border: "none",
    cursor: "pointer",
  },
  removeText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: "#fff" },
  confirmText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.text, margin: "0 0 12px 0", lineHeight: "18px" },
  confirmRow: { display: "flex", flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: RADIUS.sm, padding: "11px 12px", border: "none", cursor: "pointer" },
  cancelText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textMuted, display: "block", textAlign: "center" },
  confirmRemoveBtn: { flex: 1, backgroundColor: COLORS.danger, borderRadius: RADIUS.sm, padding: "11px 12px", border: "none", cursor: "pointer" },
  cantRemove: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderRadius: RADIUS.sm,
    padding: "10px 12px",
  },
  cantRemoveText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 12, color: COLORS.textMuted, lineHeight: "16px" },
};
