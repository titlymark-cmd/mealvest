import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { ArrowLeft, ShoppingBag } from "lucide-react-native";
import { Card } from "../../components/Card";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
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

export default function OrderHistoryScreen({ navigation }: any) {
  const { authFetch } = useAuth();
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
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>My Orders</Text>

      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}
      {!loading && !error && orders.length === 0 && (
        <View style={styles.emptyState}>
          <ShoppingBag size={28} color={COLORS.textOnDarkMuted} />
          <Text style={styles.emptyText}>No orders yet.</Text>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        renderItem={({ item }) => {
          const statusMeta = STATUS_LABEL[item.status] || { label: item.status, color: COLORS.textFaint };
          return (
            <Card style={styles.orderCard}>
              <View style={{ flex: 1 }}>
                {item.items.map((it, i) => (
                  <Text key={i} style={styles.itemLine}>{it.quantity}× {it.name}</Text>
                ))}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amount}>KSh {Number(item.amount).toLocaleString()}</Text>
                <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
              </View>
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
  emptyState: { alignItems: "center", marginTop: 40, gap: 8 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted },
  orderCard: { flexDirection: "row", alignItems: "flex-start", padding: 14 },
  itemLine: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.text, marginBottom: 2 },
  amount: { fontFamily: FONTS.displayBold, fontSize: 14, color: COLORS.text },
  statusText: { fontFamily: FONTS.bodySemibold, fontSize: 11, marginTop: 4 },
});
