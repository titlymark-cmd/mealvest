import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS } from "../../theme/theme";
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

export default function HotelOrdersScreen({ navigation }: any) {
  const { authFetch } = useAuth();
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
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Orders</Text>

      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}
      {!loading && !error && orders.length === 0 && <Text style={styles.emptyText}>No orders yet.</Text>}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        renderItem={({ item }) => {
          const meta = STATUS_META[item.status] || { label: item.status, color: COLORS.textFaint };
          return (
            <Card style={styles.orderCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  {item.items.map((it, i) => (
                    <Text key={i} style={styles.itemLine}>{it.quantity}× {it.name}</Text>
                  ))}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.amount}>KSh {Number(item.amount).toLocaleString()}</Text>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {item.status === "paid" && (
                <PrimaryButton
                  onPress={() => handleMarkReady(item.id)}
                  loading={updatingId === item.id}
                  showArrow={false}
                  style={{ marginTop: 10 }}
                >
                  Mark as ready
                </PrimaryButton>
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 56 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.textOnDark, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 30 },
  orderCard: { padding: 14 },
  itemLine: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amount: { fontFamily: FONTS.displayBold, fontSize: 14, color: COLORS.text },
  statusText: { fontFamily: FONTS.bodySemibold, fontSize: 11, marginTop: 4 },
});
