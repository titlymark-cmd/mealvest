import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { UtensilsCrossed } from "lucide-react-native";
import { COLORS, FONTS } from "../theme/theme";

const MIN_SPLASH_MS = 1400;

export function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <UtensilsCrossed size={34} color="#fff" />
      </View>
      <Text style={styles.wordmark}>MEALVEST</Text>
      <Text style={styles.tagline}>Your food money, already planned.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  wordmark: { fontSize: 24, fontFamily: FONTS.displayBold, color: COLORS.primaryDark, letterSpacing: 2 },
  tagline: { fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 6 },
});
