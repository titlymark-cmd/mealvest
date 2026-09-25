import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { COLORS, FONTS } from "../theme/theme";

const LOGO_SOURCE = require("../../assets/mealvest-logo.png");

export function Logo({ size = "md", dark = false }: { size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const dims = { sm: 30, md: 38, lg: 50 }[size];
  const textSize = { sm: 15, md: 18, lg: 24 }[size];

  return (
    <View style={styles.row}>
      <Image source={LOGO_SOURCE} style={{ width: dims, height: dims }} resizeMode="contain" />
      <Text style={[styles.wordmark, { fontSize: textSize, color: dark ? COLORS.text : COLORS.textOnDark }]}>
        MEALVEST
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontFamily: FONTS.displayBold, letterSpacing: 0.5 },
});
