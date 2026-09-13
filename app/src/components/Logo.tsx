import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { UtensilsCrossed } from "lucide-react-native";
import { COLORS, FONTS } from "../theme/theme";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: 28, md: 34, lg: 44 }[size];
  const iconSize = { sm: 14, md: 17, lg: 22 }[size];
  const textSize = { sm: 15, md: 18, lg: 24 }[size];

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { width: dims, height: dims, borderRadius: dims * 0.32 }]}>
        <UtensilsCrossed size={iconSize} color="#fff" />
      </View>
      <Text style={[styles.wordmark, { fontSize: textSize }]}>MEALVEST</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  wordmark: { fontFamily: FONTS.displayBold, color: COLORS.primaryDark, letterSpacing: 0.5 },
});
