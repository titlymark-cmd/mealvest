import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelOrders, markOrderReady, HotelOrder } from "../../services/hotelStaffApi";

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "Pending payment", color: COLORS.warning },
  paid: { label: "Paid — awaiting prep", color: COLORS.primary },
  ready: { label: "Ready for pickup", color: COLORS.success },
  redeemed: { label: "Redeemed", color: COLORS.textFaint },
  cancelled: { label: "Cancelled", color: COLORS.textFaint },
  refunded: { label: "Refunded", color: COLORS.textFaint },
};

/** Shared by Hotel Staff and Hotel Owner — byte-identical originally. */
export default function HotelOrdersScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<HotelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelOrders(authFetch);
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

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
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>
      <h1 style={styles.title}>Orders</h1>

      {loading && (
        <div style={{ marginTop: 30, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}
      {!loading && !error && orders.length === 0 && <p style={styles.emptyText}>No orders yet.</p>}

      <div style={styles.list}>
        {orders.map((item) => {
          const meta = STATUS_META[item.status] || { label: item.status, color: COLORS.textFaint };
          return (
            <Card key={item.id} style={styles.orderCard}>
              <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  {item.items.map((it, i) => (
                    <span key={i} style={styles.itemLine}>
                      {it.quantity}× {it.name}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={styles.amount}>KSh {Number(item.amount).toLocaleString()}</span>
                  <span style={{ ...styles.statusText, color: meta.color }}>{meta.label}</span>
                </div>
              </div>
              {item.status === "paid" && (
                <PrimaryButton onPress={() => handleMarkReady(item.id)} loading={updatingId === item.id} showArrow={false} style={{ marginTop: 10 }}>
                  Mark as ready
                </PrimaryButton>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 30 },
  list: { display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24, marginTop: 16 },
  orderCard: { padding: 14, display: "flex", flexDirection: "column" },
  itemLine: { display: "block", fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amount: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  statusText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, marginTop: 4 },
};
