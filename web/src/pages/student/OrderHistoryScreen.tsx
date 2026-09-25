import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { listMyOrders, Order } from "../../services/ordersApi";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "Pending payment", color: COLORS.warning },
  paid: { label: "Paid", color: COLORS.primary },
  ready: { label: "Ready", color: COLORS.primary },
  redeemed: { label: "Redeemed", color: COLORS.success },
  cancelled: { label: "Cancelled", color: COLORS.textFaint },
  refunded: { label: "Refunded", color: COLORS.textFaint },
};

export default function OrderHistoryScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listMyOrders(authFetch);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <h1 style={styles.title}>My Orders</h1>

      {loading && (
        <div style={{ marginTop: 30, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <div style={styles.emptyState}>
          <ShoppingBag size={28} color={COLORS.textOnDarkMuted} />
          <span style={styles.emptyText}>No orders yet.</span>
        </div>
      )}

      <div style={styles.list}>
        {orders.map((item) => {
          const statusMeta = STATUS_LABEL[item.status] || { label: item.status, color: COLORS.textFaint };
          return (
            <Card key={item.id} style={styles.orderCard}>
              <div style={{ flex: 1 }}>
                {item.items.map((it, i) => (
                  <span key={i} style={styles.itemLine}>
                    {it.quantity}× {it.name}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={styles.amount}>KSh {Number(item.amount).toLocaleString()}</span>
                <span style={{ ...styles.statusText, color: statusMeta.color }}>{statusMeta.label}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 40, gap: 8 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted },
  list: { display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24, marginTop: 16 },
  orderCard: { display: "flex", flexDirection: "row", alignItems: "flex-start", padding: 14 },
  itemLine: { display: "block", fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  statusText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, marginTop: 4 },
};
