import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { UtensilsCrossed } from "lucide-react-native";
import { COLORS, FONTS, GRADIENT } from "../theme/theme";

export function Logo({ size = "md", dark = false }: { size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const dims = { sm: 28, md: 34, lg: 44 }[size];
  const iconSize = { sm: 14, md: 17, lg: 22 }[size];
  const textSize = { sm: 15, md: 18, lg: 24 }[size];

  return (
    <View style={styles.row}>
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, { width: dims, height: dims, borderRadius: dims * 0.32 }]}
      >
        <UtensilsCrossed size={iconSize} color="#fff" />
      </LinearGradient>
      <Text style={[styles.wordmark, { fontSize: textSize, color: dark ? COLORS.text : COLORS.textOnDark }]}>
        MEALVEST
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { alignItems: "center", justifyContent: "center" },
  wordmark: { fontFamily: FONTS.displayBold, letterSpacing: 0.5 },
});
