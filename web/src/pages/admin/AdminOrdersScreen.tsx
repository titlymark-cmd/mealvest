import React, { useEffect, useState, useCallback } from "react";
import { ShoppingBag } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { timeAgo, formatKsh } from "../../components/admin/adminFormat";
import { fetchAllOrders, AdminOrder } from "../../services/adminApi";

const STATUS_COLOR: Record<string, string> = {
  pending_payment: COLORS.textFaint,
  paid: COLORS.warning,
  ready: COLORS.accent,
  redeemed: COLORS.success,
  cancelled: COLORS.danger,
  refunded: COLORS.textFaint,
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "paid", label: "Paid" },
  { value: "ready", label: "Ready" },
  { value: "redeemed", label: "Redeemed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function itemsSummary(items: AdminOrder["items"]): string {
  if (!Array.isArray(items) || items.length === 0) return "No items";
  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const first = items[0]?.name || "item";
  return items.length === 1 ? `${totalQty}× ${first}` : `${first} + ${items.length - 1} more`;
}

export default function AdminOrdersScreen() {
  const { authFetch } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllOrders(authFetch, status ? { status } : undefined);
      setOrders(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Orders</h1>
          <p style={styles.subtitle}>Most recent 200 orders across every partner hotel.</p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.select}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {loading ? (
        <div style={styles.center}>
          <Spinner size="large" color={COLORS.primary} />
        </div>
      ) : orders.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ShoppingBag size={22} color={COLORS.textFaint} />
          <p style={styles.emptyText}>No orders match this filter yet.</p>
        </Card>
      ) : (
        <div style={styles.list}>
          {orders.map((o) => (
            <Card key={o.id} style={styles.row}>
              <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                <span style={styles.hotelName}>{o.hotel_name}</span>
                <span style={styles.meta}>{o.student_email}</span>
              </div>
              <div style={{ flex: "1 1 120px", minWidth: 100 }}>
                <span style={styles.itemsText}>{itemsSummary(o.items)}</span>
              </div>
              <div style={styles.rowRightGroup}>
                <span style={styles.amount}>{formatKsh(o.amount)}</span>
                <span style={{ ...styles.statusBadge, backgroundColor: STATUS_COLOR[o.status] || COLORS.textFaint }}>
                  {o.status.replace("_", " ")}
                </span>
                <span style={styles.date}>{timeAgo(o.redeemed_at || o.created_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60 },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4 },
  select: {
    backgroundColor: COLORS.cardWhite,
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    padding: "8px 12px",
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    fontSize: 12,
    color: COLORS.text,
    outline: "none",
  },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  emptyCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 40 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, margin: 0 },
  list: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24 },
  row: { display: "flex", flexDirection: "row", alignItems: "center", padding: 14, gap: 12, flexWrap: "wrap" },
  rowRightGroup: { display: "flex", flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 },
  hotelName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.text },
  meta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  itemsText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  amount: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 13, color: COLORS.text },
  statusBadge: {
    borderRadius: RADIUS.pill,
    padding: "4px 10px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 10,
    color: "#fff",
    textTransform: "capitalize",
    flexShrink: 0,
  },
  date: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, flexShrink: 0, minWidth: 70, textAlign: "right" },
};
