import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UtensilsCrossed } from "lucide-react-native";
import { COLORS, FONTS, GRADIENT, glow } from "../theme/theme";

const MIN_SPLASH_MS = 1400;

export function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <LinearGradient colors={[COLORS.bgDeep, COLORS.bg]} style={styles.container}>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.badge, glow(COLORS.primary, 24)]}>
        <UtensilsCrossed size={34} color="#fff" />
      </LinearGradient>
      <Text style={styles.wordmark}>MEALVEST</Text>
      <Text style={styles.tagline}>Your food money, already planned.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  wordmark: { fontSize: 24, fontFamily: FONTS.displayBold, color: COLORS.textOnDark, letterSpacing: 2 },
  tagline: {
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
    color: COLORS.accent,
    marginTop: 8,
    letterSpacing: 0.6,
  },
});
