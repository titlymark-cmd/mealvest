import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { QrCode, LogOut, ChevronRight, ClipboardList, DollarSign } from "lucide-react-native";
import { Card } from "../../components/Card";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelDashboard } from "../../services/hotelStaffApi";

export default function HotelStaffHomeScreen({ navigation }: any) {
  const { logout, authFetch } = useAuth();
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelDashboard(authFetch);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hotel dashboard</Text>
          <Text style={styles.title}>{dashboard?.hotel.name || "—"}</Text>
        </View>
        <TouchableOpacity onPress={() => logout()} style={styles.logoutBtn}>
          <LogOut size={16} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.navigate("HotelScanner")} style={styles.scanBtn}>
        <View style={styles.scanIcon}>
          <QrCode size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.scanTitle}>Scan meal QR code</Text>
          <Text style={styles.scanSubtitle}>Redeem a student's meal</Text>
        </View>
        <ChevronRight size={18} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("HotelOrders")} style={styles.linkRow}>
        <ClipboardList size={16} color={COLORS.primary} />
        <Text style={styles.linkText}>View all orders</Text>
        <ChevronRight size={16} color={COLORS.textFaint} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("HotelMenuManage")} style={styles.linkRow}>
        <ClipboardList size={16} color={COLORS.primary} />
        <Text style={styles.linkText}>Manage menu</Text>
        <ChevronRight size={16} color={COLORS.textFaint} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("HotelProfile")} style={styles.linkRow}>
        <ClipboardList size={16} color={COLORS.primary} />
        <Text style={styles.linkText}>Hotel profile</Text>
        <ChevronRight size={16} color={COLORS.textFaint} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && dashboard && (
        <>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <ClipboardList size={16} color={COLORS.primary} />
              <Text style={styles.statLabel}>Redeemed today</Text>
              <Text style={styles.statValue}>{dashboard.stats.redeemed_orders}</Text>
            </Card>
            <Card style={styles.statCard}>
              <DollarSign size={16} color={COLORS.success} />
              <Text style={styles.statLabel}>Revenue</Text>
              <Text style={styles.statValue}>KSh {Number(dashboard.stats.gross_revenue).toLocaleString()}</Text>
            </Card>
          </View>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Pending orders</Text>
              <Text style={styles.statValue}>{dashboard.stats.pending_orders}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Net earnings</Text>
              <Text style={styles.statValue}>KSh {Number(dashboard.stats.net_earnings).toLocaleString()}</Text>
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.text, marginTop: 2 },
  logoutBtn: { width: 36, height: 36, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: 16, marginTop: 18, marginBottom: 18 },
  scanIcon: { width: 42, height: 42, borderRadius: RADIUS.md, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  scanTitle: { fontFamily: FONTS.bodySemibold, fontSize: 14, color: "#fff" },
  scanSubtitle: { fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.85)" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 16 },
  linkText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1 },
  statLabel: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 8 },
  statValue: { fontFamily: FONTS.displayBold, fontSize: 15, color: COLORS.text, marginTop: 2 },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.danger, marginTop: 20, textAlign: "center" },
});
