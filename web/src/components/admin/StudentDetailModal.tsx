import React, { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { Spinner } from "../Spinner";
import { badgeColorFor, formatKsh } from "./adminFormat";
import { fetchStudentDetail, StudentDetail } from "../../services/adminApi";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

export function StudentDetailModal({
  userId,
  fallbackName,
  onClose,
}: {
  userId: string;
  fallbackName?: string;
  onClose: () => void;
}) {
  const { authFetch } = useAuth();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchStudentDetail(authFetch, userId)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Could not load this student."));
    return () => {
      active = false;
    };
  }, [authFetch, userId]);

  const s = data?.student;
  const name = s?.full_name || fallbackName || "Student";

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerIdentity}>
            {s?.avatar_url ? (
              <img src={s.avatar_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={{ ...styles.avatar, backgroundColor: badgeColorFor(userId) }}>
                <span style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div>
              <h2 style={styles.title}>{name}</h2>
              <span style={styles.subtitle}>Student profile</span>
            </div>
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

          {data && s && (
            <>
              <span style={styles.sectionLabel}>Account</span>
              <Row label="Email" value={s.email} />
              <Row label="Phone" value={s.phone_number || "—"} />
              <Row label="Alternate phone" value={s.alternate_phone_number || "—"} />
              <Row label="Institution" value={s.institution || "—"} />
              <Row label="Admission number" value={s.admission_number || "—"} />
              <Row
                label="Status"
                value={<span style={{ textTransform: "capitalize" }}>{s.account_status}</span>}
              />
              <Row label="Sign-in method" value={s.auth_provider === "google" ? "Google" : "Password"} />
              <Row label="Email verified" value={s.email_verified ? "Yes" : "No"} />
              <Row label="Member since" value={fmtDate(s.created_at)} />

              <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Current plan</span>
              {data.currentBudget ? (
                <div style={styles.planBox}>
                  <Row label="Plan amount" value={formatKsh(data.currentBudget.total_amount)} />
                  <Row label="Remaining" value={formatKsh(data.currentBudget.remaining_amount)} />
                  <Row label="Daily allowance" value={formatKsh(data.currentBudget.daily_allowance)} />
                  <Row label="Duration" value={`${data.currentBudget.number_of_days} days`} />
                  <Row label="Hotel" value={data.currentBudget.hotel_name || "—"} />
                  <Row
                    label="Window"
                    value={`${fmtDate(data.currentBudget.start_date)} → ${fmtDate(data.currentBudget.end_date)}`}
                  />
                </div>
              ) : (
                <p style={styles.muted}>No active plan.</p>
              )}

              <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Activity</span>
              <Row label="Total orders" value={data.stats.total_orders} />
              <Row label="Meals redeemed" value={data.stats.redeemed_orders} />
              <Row label="Total spent" value={formatKsh(data.stats.total_spent)} />
              <Row label="Last order" value={fmtDate(data.stats.last_order_at)} />

              {data.recentOrders.length > 0 && (
                <>
                  <span style={{ ...styles.sectionLabel, marginTop: 18 }}>Recent orders</span>
                  <div style={styles.ordersList}>
                    {data.recentOrders.map((o) => (
                      <div key={o.id} style={styles.orderRow}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={styles.orderHotel}>{o.hotel_name || "—"}</span>
                          <span style={styles.orderDate}>{fmtDate(o.created_at)}</span>
                        </div>
                        <span style={{ ...styles.orderStatus, textTransform: "capitalize" }}>{o.status}</span>
                        <span style={styles.orderAmount}>{formatKsh(o.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={styles.privacyNote}>
                <ShieldCheck size={13} color={COLORS.success} />
                <span>Passwords and PINs are never shown.</span>
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
  headerIdentity: { display: "flex", flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarImg: { width: 44, height: 44, borderRadius: RADIUS.pill, objectFit: "cover", flexShrink: 0 },
  avatarText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 17, color: "#fff" },
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
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger },
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
  planBox: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.sm,
    padding: "4px 12px",
  },
  muted: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, fontStyle: "italic", margin: 0 },
  ordersList: { display: "flex", flexDirection: "column", gap: 6 },
  orderRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.sm,
    padding: "8px 12px",
  },
  orderHotel: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.text },
  orderDate: { display: "block", fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint },
  orderStatus: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 11, color: COLORS.textMuted },
  orderAmount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 12, color: COLORS.text },
  privacyNote: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.textMuted,
  },
};
