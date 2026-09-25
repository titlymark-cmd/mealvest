import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput } from "react-native";
import { LogOut, Building2, Users, ShoppingBag, DollarSign, Plus, Pencil } from "lucide-react-native";
import { Card } from "../../components/Card";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminOverview, fetchAdminHotels, approveHotel, suspendHotel, updateHotelCommission, AdminOverview, AdminHotel } from "../../services/adminApi";

const STATUS_COLOR: Record<string, string> = {
  active: COLORS.success,
  pending_verification: COLORS.warning,
  suspended: COLORS.danger,
  expired: COLORS.textFaint,
};

export default function AdminHomeScreen({ navigation }: any) {
  const { logout, authFetch } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const [commissionDraft, setCommissionDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, hs] = await Promise.all([fetchAdminOverview(authFetch), fetchAdminHotels(authFetch)]);
      setOverview(ov);
      setHotels(hs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin data.");
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
    setCommissionDraft(hotel.commission_percent);
  };

  const saveCommission = async (hotelId: string) => {
    const value = Number(commissionDraft);
    if (!value && value !== 0) return;
    setActingOn(hotelId);
    try {
      await updateHotelCommission(authFetch, hotelId, value);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Platform overview</Text>
          <Text style={styles.title}>Mealvest Admin</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => navigation.navigate("AdminCreateHotel")} style={styles.addBtn}>
            <Plus size={14} color={COLORS.primary} />
            <Text style={styles.addBtnText}>Add hotel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()} style={styles.logoutBtn}>
            <LogOut size={16} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {overview && (
        <>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Building2 size={16} color={COLORS.primary} />
              <Text style={styles.statLabel}>Hotels</Text>
              <Text style={styles.statValue}>{overview.hotels.total}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Users size={16} color={COLORS.primary} />
              <Text style={styles.statLabel}>Students</Text>
              <Text style={styles.statValue}>{overview.students}</Text>
            </Card>
          </View>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <ShoppingBag size={16} color={COLORS.warning} />
              <Text style={styles.statLabel}>Orders today</Text>
              <Text style={styles.statValue}>{overview.orders.today}</Text>
            </Card>
            <Card style={styles.statCard}>
              <DollarSign size={16} color={COLORS.success} />
              <Text style={styles.statLabel}>Commission earned</Text>
              <Text style={styles.statValue}>KSh {Number(overview.orders.mealvest_commission).toLocaleString()}</Text>
            </Card>
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Hotels</Text>
      <FlatList
        data={hotels}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
        renderItem={({ item }) => (
          <Card style={styles.hotelCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hotelName}>{item.name}</Text>
              <Text style={[styles.hotelStatus, { color: STATUS_COLOR[item.status] || COLORS.textFaint }]}>
                {item.status.replace("_", " ")}
              </Text>
              {editingCommissionId === item.id ? (
                <View style={styles.commissionEditRow}>
                  <TextInput
                    style={styles.commissionInput}
                    value={commissionDraft}
                    onChangeText={setCommissionDraft}
                    keyboardType="numeric"
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => saveCommission(item.id)} style={styles.commissionSaveBtn}>
                    <Text style={styles.commissionSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => startEditCommission(item)} style={styles.commissionRow}>
                  <Text style={styles.commissionText}>Commission: {item.commission_percent}%</Text>
                  <Pencil size={10} color={COLORS.textFaint} />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ gap: 6 }}>
            {item.status === "pending_verification" && (
              <TouchableOpacity
                onPress={() => handleApprove(item.id)}
                disabled={actingOn === item.id}
                style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
              >
                <Text style={styles.actionText}>Approve</Text>
              </TouchableOpacity>
            )}
            {item.status === "active" && (
              <TouchableOpacity
                onPress={() => handleSuspend(item.id)}
                disabled={actingOn === item.id}
                style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
              >
                <Text style={styles.actionText}>Suspend</Text>
              </TouchableOpacity>
            )}
            {item.status === "suspended" && (
              <TouchableOpacity
                onPress={() => handleApprove(item.id)}
                disabled={actingOn === item.id}
                style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
              >
                <Text style={styles.actionText}>Reactivate</Text>
              </TouchableOpacity>
            )}
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  greeting: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.textOnDark, marginTop: 2 },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(252,244,234,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.danger, marginBottom: 12, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1 },
  statLabel: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 8 },
  statValue: { fontFamily: FONTS.displayBold, fontSize: 15, color: COLORS.text, marginTop: 2 },
  sectionTitle: { fontFamily: FONTS.displayBold, fontSize: 15, color: COLORS.textOnDark, marginTop: 16, marginBottom: 10 },
  hotelCard: { flexDirection: "row", alignItems: "center", padding: 12 },
  hotelName: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text },
  hotelStatus: { fontFamily: FONTS.bodySemibold, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  actionBtn: { borderRadius: RADIUS.sm, paddingVertical: 7, paddingHorizontal: 12 },
  actionText: { fontFamily: FONTS.bodySemibold, fontSize: 11, color: "#fff" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(252,244,234,0.08)",
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addBtnText: { fontFamily: FONTS.bodySemibold, fontSize: 12, color: COLORS.primary },
  commissionRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  commissionText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted },
  commissionEditRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  commissionInput: {
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.text,
    width: 50,
  },
  commissionSaveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  commissionSaveText: { fontFamily: FONTS.bodySemibold, fontSize: 10, color: "#fff" },
});
