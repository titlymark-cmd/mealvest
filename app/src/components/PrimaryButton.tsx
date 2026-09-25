import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";
import { COLORS, FONTS, RADIUS, GRADIENT, glow } from "../theme/theme";

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
  showArrow = true,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  showArrow?: boolean;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrapper, (disabled || loading) && styles.disabled, style]}
      activeOpacity={0.85}
    >
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.text}>{children}</Text>
            {showArrow && <ChevronRight size={18} color="#fff" />}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: RADIUS.sm,
    ...glow(COLORS.primary, 14),
  },
  disabled: { opacity: 0.45, shadowOpacity: 0 },
  gradient: {
    borderRadius: RADIUS.sm,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  text: { color: "#fff", fontFamily: FONTS.bodySemibold, fontSize: 15 },
});
