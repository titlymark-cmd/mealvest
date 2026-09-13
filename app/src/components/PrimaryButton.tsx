import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { COLORS, FONTS, RADIUS } from "../theme/theme";

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
      style={[styles.button, (disabled || loading) && styles.disabled, style]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <Text style={styles.text}>{children}</Text>
          {showArrow && <ChevronRight size={18} color="#fff" />}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  disabled: { opacity: 0.45 },
  text: { color: "#fff", fontFamily: FONTS.bodySemibold, fontSize: 15 },
});
