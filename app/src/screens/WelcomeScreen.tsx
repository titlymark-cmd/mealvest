import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UtensilsCrossed } from "lucide-react-native";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS, GRADIENT, glow } from "../theme/theme";
import { useHealthCheck } from "../hooks/useHealthCheck";

export default function WelcomeScreen({ navigation }: any) {
  const { loading, data, error } = useHealthCheck();

  return (
    <View style={styles.container}>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.badge, glow(COLORS.primary, 16)]}>
        <UtensilsCrossed size={28} color="#fff" />
      </LinearGradient>
      <Logo size="lg" />
      <Text style={styles.subtitle}>Your food money, already planned.</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Backend connection</Text>
        {loading && (
          <View style={styles.row}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.statusText}>Checking…</Text>
          </View>
        )}
        {!loading && data && (
          <Text style={[styles.statusText, data.status === "ok" ? styles.ok : styles.degraded]}>
            {data.status === "ok" ? "✓ Connected" : "⚠ Degraded"} — DB: {data.db}
          </Text>
        )}
        {!loading && error && <Text style={[styles.statusText, styles.errorText]}>✗ {error}</Text>}
      </View>

      <PrimaryButton onPress={() => navigation.navigate("Login")} showArrow={false} style={{ width: "100%", marginTop: 28 }}>
        Sign in
      </PrimaryButton>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("RegisterStudent")}>
        <Text style={styles.secondaryButtonText}>I'm a student — create account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate("RegisterHotel")}>
        <Text style={styles.link}>Registering a hotel? Sign up here</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 6, marginBottom: 28 },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  statusLabel: { fontSize: 12, fontFamily: FONTS.bodySemibold, color: COLORS.textMuted, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontSize: 14, fontFamily: FONTS.bodySemibold, color: COLORS.text },
  ok: { color: COLORS.success },
  degraded: { color: COLORS.warning },
  errorText: { color: COLORS.danger },
  secondaryButton: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 12,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: { color: COLORS.textOnDark, fontFamily: FONTS.bodySemibold, fontSize: 14 },
  link: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontSize: 13, marginTop: 18 },
});
