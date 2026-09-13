import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { Card } from "../../components/Card";
import { COLORS, FONTS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchHotelDashboard, HotelDashboard } from "../../services/hotelStaffApi";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mpesa_till: "M-Pesa Till",
  paybill: "PayBill",
  send_money: "M-Pesa (Send Money)",
  pochi_la_biashara: "Pochi la Biashara",
  bank: "Bank Account",
};

/**
 * Read-only for now — editing settlement details safely requires
 * re-triggering payment_verification_status back to 'pending' and an
 * audit-trail write (hotel_payment_detail_changes), which the
 * backend already supports at the data-model level but has no
 * dedicated "update my own settlement details" endpoint yet (only
 * admin-side commission editing exists). Viewing what's on file is
 * real; editing it is the one honestly-flagged remaining gap.
 */
export default function HotelProfileScreen({ navigation }: any) {
  const { authFetch } = useAuth();
  const [dashboard, setDashboard] = useState<HotelDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchHotelDashboard(authFetch);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your profile.");
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
      <Text style={styles.title}>Hotel Profile</Text>

      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      {!loading && dashboard && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <Row label="Hotel name" value={dashboard.hotel.name} />
            <Row label="Status" value={dashboard.hotel.status.replace("_", " ")} />
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <Text style={styles.sectionLabel}>COMMERCIAL TERMS</Text>
            <Row label="Commission rate" value={`${dashboard.hotel.commission_percent}%`} />
            <Row label="Registration fee" value={`KSh ${Number(dashboard.hotel.registration_fee).toLocaleString()}`} />
          </Card>

          <Card>
            <Text style={styles.sectionLabel}>SETTLEMENT METHOD</Text>
            <Row
              label="Method on file"
              value={PAYMENT_METHOD_LABEL[dashboard.hotel.payment_method || ""] || "Not set"}
            />
            <Text style={styles.note}>
              To change your settlement details, contact Mealvest support — this keeps a verified
              audit trail for every change, per Mealvest's financial security policy.
            </Text>
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 56 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.text, marginBottom: 16 },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 20 },
  sectionLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10, color: COLORS.textFaint, letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text, textTransform: "capitalize" },
  note: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 10, lineHeight: 16 },
});
