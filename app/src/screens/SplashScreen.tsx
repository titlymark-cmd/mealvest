import React, { useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, FONTS, glow } from "../theme/theme";

const MIN_SPLASH_MS = 1400;
const LOGO_SOURCE = require("../../assets/mealvest-logo.png");

export function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <LinearGradient colors={[COLORS.bgDeep, COLORS.bg]} style={styles.container}>
      <View style={[styles.badge, glow(COLORS.primary, 24)]}>
        <Image source={LOGO_SOURCE} style={styles.badgeImage} resizeMode="contain" />
      </View>
      <Text style={styles.wordmark}>MEALVEST</Text>
      <Text style={styles.tagline}>Your food money, already planned.</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badgeImage: { width: 96, height: 96 },
  wordmark: { fontSize: 24, fontFamily: FONTS.displayBold, color: COLORS.textOnDark, letterSpacing: 2 },
  tagline: {
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
    color: COLORS.accent,
    marginTop: 8,
    letterSpacing: 0.6,
  },
});
