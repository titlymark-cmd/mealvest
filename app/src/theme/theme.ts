/**
 * MEALVEST design tokens — ported directly from the original web
 * prototype so the Expo app looks and feels like the same product,
 * not a generic React Native default.
 */
export const COLORS = {
  bg: "#F0F9FF",
  card: "#FFFFFF",
  border: "#DCEEFB",
  primary: "#0C8CE9",
  primaryLight: "#38BDF8",
  primaryDark: "#075985",
  text: "#075985",
  textMuted: "#0369A1",
  textFaint: "#7CA9C6",
  accent: "#FB923C", // saved credits / warmth accent
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
};

export const GRADIENT = [COLORS.primary, COLORS.primaryLight] as const;

// Font family names — must match what's registered via useFonts in
// App.tsx (@expo-google-fonts/sora and /inter).
export const FONTS = {
  displayBold: "Sora_700Bold",
  displaySemibold: "Sora_600SemiBold",
  displayMedium: "Sora_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
};

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};
