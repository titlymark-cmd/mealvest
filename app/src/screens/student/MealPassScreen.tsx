import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ShieldCheck, ArrowLeft } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { createOrder, payOrder, Order } from "../../services/ordersApi";

type Stage = "creating" | "paying" | "ready" | "error";

/**
 * The ONLY screen that ever displays a meal QR code, and it never
 * generates one itself — `order.qr_token` comes back from
 * `payOrder()`, which is the backend's HMAC-signed value. This
 * component just renders whatever string the backend gave it as a
 * scannable image; it has no ability to produce a valid token on
 * its own, by design (see server/src/lib/qr.ts).
 */
export default function MealPassScreen({ route, navigation }: any) {
  const { authFetch } = useAuth();
  const { hotelId, hotelName, itemId, itemName, itemPrice } = route.params;

  const [stage, setStage] = useState<Stage>("creating");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runFlow = useCallback(async () => {
    setStage("creating");
    setError(null);
    try {
      const created = await createOrder(authFetch, hotelId, [{ itemId, quantity: 1 }]);
      setStage("paying");
      const paid = await payOrder(authFetch, created.id);
      setOrder(paid);
      setStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }, [authFetch, hotelId, itemId]);

  useEffect(() => {
    runFlow();
  }, [runFlow]);

  if (stage === "creating" || stage === "paying") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.statusText}>
          {stage === "creating" ? "Placing your order…" : "Paying from your meal plan…"}
        </Text>
      </View>
    );
  }

  if (stage === "error") {
    const needsBudget = error?.toLowerCase().includes("meal plan") || error?.toLowerCase().includes("budget");
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>
          {needsBudget ? "You don't have an active meal plan yet" : "Could not complete this order"}
        </Text>
        <Text style={styles.errorBody}>{error}</Text>
        {needsBudget ? (
          <PrimaryButton
            onPress={() => navigation.navigate("BudgetOnboarding", { hotelId, hotelName })}
            style={{ marginTop: 20, width: 220 }}
          >
            Set up a plan
          </PrimaryButton>
        ) : (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
            <Text style={styles.link}>Back to menu</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // stage === "ready" — order is real, paid, and has a real qr_token
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.navigate("HotelList")} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back to hotels</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Your Meal Pass</Text>
      <Text style={styles.subtitle}>Show this to {hotelName} to redeem your meal</Text>

      <Card style={styles.qrCard}>
        <Text style={styles.itemName}>{itemName}</Text>
        <Text style={styles.itemPrice}>KSh {Number(itemPrice).toLocaleString()}</Text>

        {order?.qr_token ? (
          <View style={styles.qrWrap}>
            <QRCode value={order.qr_token} size={200} backgroundColor="#fff" color={COLORS.text} />
          </View>
        ) : (
          <Text style={styles.qrMissingText}>No QR code was returned for this order.</Text>
        )}

        <View style={styles.verifiedRow}>
          <ShieldCheck size={14} color={COLORS.success} />
          <Text style={styles.verifiedText}>Signed and verified by Mealvest</Text>
        </View>
      </Card>

      <Text style={styles.hint}>This code is unique to this exact order and expires once redeemed.</Text>

      <PrimaryButton onPress={() => navigation.navigate("HotelList")} style={{ marginTop: 24 }}>
        Done
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 24 },
  statusText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.textOnDarkMuted, marginTop: 16 },
  errorTitle: { fontFamily: FONTS.displayBold, fontSize: 17, color: COLORS.textOnDark, marginBottom: 8, textAlign: "center" },
  errorBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center" },
  qrMissingText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  link: { fontFamily: FONTS.bodySemibold, fontSize: 14, color: COLORS.primary },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  backText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.primary },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.textOnDark, textAlign: "center" },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 4, marginBottom: 20 },
  qrCard: { alignItems: "center", padding: 24 },
  itemName: { fontFamily: FONTS.displayBold, fontSize: 16, color: COLORS.text },
  itemPrice: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, marginBottom: 18 },
  qrWrap: { padding: 14, backgroundColor: "#fff", borderRadius: RADIUS.sm },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 },
  verifiedText: { fontFamily: FONTS.bodySemibold, fontSize: 11, color: COLORS.success },
  hint: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textOnDarkMuted, textAlign: "center", marginTop: 16 },
});
