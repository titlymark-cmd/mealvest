import React, { useEffect, useState, useCallback } from "react";
import { ShoppingBag } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { HOTEL_MOBILE_BREAKPOINT } from "../../components/hotel/HotelSidebar";
import { timeAgo, formatKsh } from "../../components/shared/format";
import { fetchHotelOrders, markOrderReady, HotelOrder } from "../../services/hotelStaffApi";

// "Preparing" is the friendlier label for the real 'paid' status (paid,
// not yet marked ready) — there's no distinct backend "preparing" state,
// this is just a cosmetic relabel of a real one, not a fabricated status.
const TABS = [
  { value: "", label: "All" },
  { value: "paid", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "redeemed", label: "Redeemed" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "pending payment", color: COLORS.textFaint },
  paid: { label: "preparing", color: COLORS.warning },
  ready: { label: "ready", color: COLORS.accent },
  redeemed: { label: "redeemed", color: COLORS.success },
  cancelled: { label: "cancelled", color: COLORS.textFaint },
  refunded: { label: "refunded", color: COLORS.textFaint },
};

function itemsSummary(items: HotelOrder["items"]): string {
  if (!Array.isArray(items) || items.length === 0) return "No items";
  return items.map((it) => `${it.quantity}× ${it.name}`).join(", ");
}

export default function HotelOwnerOrdersScreen() {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < HOTEL_MOBILE_BREAKPOINT;
  const [orders, setOrders] = useState<HotelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHotelOrders(authFetch, tab || undefined);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkReady = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      await markOrderReady(authFetch, orderId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this order.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Orders</h1>
      <p style={styles.subtitle}>Live order status and handoff.</p>

      <div style={styles.tabRow}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{ ...styles.tab, ...(tab === t.value ? styles.tabActive : null) }}
          >
            <span style={{ ...styles.tabText, ...(tab === t.value ? styles.tabTextActive : null) }}>{t.label}</span>
          </button>
        ))}
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {loading ? (
        <div style={styles.center}>
          <Spinner size="large" color={COLORS.primary} />
        </div>
      ) : orders.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ShoppingBag size={22} color={COLORS.textFaint} />
          <p style={styles.emptyText}>No orders here yet.</p>
        </Card>
      ) : (
        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)" }}>
          {orders.map((o) => {
            const meta = STATUS_META[o.status] || { label: o.status, color: COLORS.textFaint };
            return (
              <Card key={o.id} style={styles.orderCard}>
                <div style={styles.orderHeader}>
                  <p style={styles.itemsText}>{itemsSummary(o.items)}</p>
                  <span style={{ ...styles.statusBadge, backgroundColor: meta.color }}>{meta.label}</span>
                </div>

                <div style={styles.orderFooter}>
                  <span style={styles.amount}>{formatKsh(o.amount)}</span>
                  <span style={styles.date}>{timeAgo(o.created_at)}</span>
                </div>

                {o.status === "paid" && (
                  <button
                    onClick={() => handleMarkReady(o.id)}
                    disabled={updatingId === o.id}
                    style={styles.readyBtn}
                  >
                    <span style={styles.readyBtnText}>{updatingId === o.id ? "Updating…" : "Mark as Ready"}</span>
                  </button>
                )}
                {o.status === "ready" && <p style={styles.hintText}>Redeem this at the QR scanner when the student arrives.</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 16 },
  tabRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  tab: { backgroundColor: "rgba(252,244,234,0.08)", borderRadius: RADIUS.pill, padding: "8px 16px" },
  tabActive: { background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})` },
  tabText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textOnDarkMuted },
  tabTextActive: { color: "#fff" },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  emptyCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 40 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, margin: 0 },
  grid: { display: "grid", gap: 14, paddingBottom: 24 },
  orderCard: { display: "flex", flexDirection: "column", padding: 14, gap: 8, minWidth: 0 },
  orderHeader: { display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  itemsText: {
    flex: 1,
    margin: 0,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
    color: COLORS.text,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  statusBadge: {
    borderRadius: RADIUS.pill,
    padding: "4px 8px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 9,
    color: "#fff",
    textTransform: "capitalize",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  orderFooter: { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  amount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  date: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint },
  readyBtn: { backgroundColor: COLORS.bgDeep, borderRadius: RADIUS.sm, padding: "9px 12px", marginTop: 2 },
  readyBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "#fff", textAlign: "center", display: "block" },
  hintText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, margin: "2px 0 0 0", fontStyle: "italic" },
};
