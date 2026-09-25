/**
 * MEALVEST design tokens — "warm espresso kitchen".
 *
 * Two-surface system, carried over from the UI/UX reference design:
 *   - COLORS.bg / bgDeep: the app's dark espresso CANVAS. Screens sit
 *     directly on this. Text placed straight on the canvas (page
 *     titles, subtitles, nav labels) MUST use the `OnDark` roles
 *     below, not `text`/`textMuted` — those are for text INSIDE a
 *     cream/white card, and are unreadable on the dark canvas.
 *   - COLORS.card / cardWhite: the cream/white CARD surface that
 *     floats on top of the canvas (see components/Card.tsx). Text
 *     inside a card uses `text`/`textMuted`/`textFaint`.
 *
 * When adding a new Text style, ask: "is this sitting directly on the
 * screen background, or inside a Card/input/other light surface?" —
 * that answer picks which text-color family to use.
 */
export const COLORS = {
  // Canvas
  bg: "#1D1511", // espresso
  bgDeep: "#2C1610", // coffee — sidebars, gradients, slightly-raised dark panels
  border: "#4A3528", // coffeeBorder — dividers/outlines on the dark canvas

  // Card surface
  card: "#FCF4EA", // cream
  cardWhite: "#FFFFFF",
  borderSoft: "#ECDCC8", // beige — dividers/outlines on cream cards

  // Brand / accent
  primary: "#E5482E", // tomato
  primaryLight: "#FF8A3D", // orange
  primaryDark: "#C23A24",
  accent: "#F5A623", // golden
  accentSoft: "#FFE1C7", // peach — badges/chips on cream cards

  // Status
  success: "#5FAF45",
  successSoft: "#E5F1D9",
  successDark: "#3F7D2C",
  warning: "#F5A623",
  danger: "#E5482E",
  disabled: "#9A928C",

  // Text on a CREAM/WHITE card
  text: "#2C1610",
  textMuted: "#6B625C",
  textFaint: "#9A928C",

  // Text directly on the dark CANVAS
  textOnDark: "#FCF4EA",
  textOnDarkMuted: "rgba(252,244,234,0.62)",
};

export const GRADIENT = [COLORS.primary, COLORS.primaryLight] as const;
export const RING_GRADIENT = [COLORS.primary, COLORS.accent] as const;

/** Warm glow shadow used behind primary buttons, active nav items, etc. */
export function glow(color: string, radius = 16) {
  return {
    shadowColor: color,
    shadowOpacity: 0.35,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  };
}

// Font family names — must match what's registered via useFonts in
// App.tsx (@expo-google-fonts/poppins). One family throughout, only
// the weight changes, matching the reference design.
export const FONTS = {
  displayBold: "Poppins_800ExtraBold",
  displaySemibold: "Poppins_700Bold",
  displayMedium: "Poppins_600SemiBold",
  body: "Poppins_400Regular",
  bodyMedium: "Poppins_500Medium",
  bodySemibold: "Poppins_600SemiBold",
};

export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};
