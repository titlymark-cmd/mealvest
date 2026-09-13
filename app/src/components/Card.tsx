import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { COLORS, RADIUS } from "../theme/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
