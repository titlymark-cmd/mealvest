import type { CSSProperties } from "react";

/**
 * RN StyleSheet -> CSSProperties translation gotchas (read before
 * porting any more screens from app/src/screens/*):
 *
 *   1. flexDirection default. RN's <View> implicitly defaults to
 *      "column"; a plain CSS `display:"flex"` div defaults to "row".
 *      Every container div needs an EXPLICIT flexDirection unless
 *      "row" is actually intended — omitting it is the single easiest
 *      way to silently break a layout that looked identical to the
 *      RN style object at a glance.
 *   2. Shadows. RN's shadowColor/shadowOpacity/shadowRadius/
 *      shadowOffset/elevation collapse to one CSS boxShadow — see
 *      glow() below for the pattern.
 *   3. Borders. RN's separate borderWidth+borderColor collapse to
 *      one CSS `border: "Npx solid color"`.
 *   4. Numbers are px. RN's unitless dimension numbers (width: 100)
 *      are density-independent pixels — CSS px is the direct
 *      equivalent, just append "px" (or use the numeric value in a
 *      CSSProperties object, which React itself appends "px" to for
 *      the properties that need a unit).
 *   5. gap works unchanged — modern browsers support CSS flexbox
 *      `gap` directly, no translation needed.
 *   6. TouchableOpacity's activeOpacity has no CSS equivalent by
 *      default; use a `:active` opacity rule or onMouseDown/onMouseUp
 *      state where the original relied on that press feedback.
 */

/**
 * MEALVEST design tokens — "warm espresso kitchen".
 *
 * Ported 1:1 from the original app's src/theme/theme.ts (React Native).
 * Same export names/shapes on purpose, so every screen migrating from
 * RN keeps importing `{ COLORS, FONTS, RADIUS }` unchanged — only the
 * style *property names* change (RN StyleSheet -> CSSProperties), not
 * the values or how they're organized.
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

/**
 * Warm glow shadow used behind primary buttons, active nav items, etc.
 * RN's shadowColor/shadowOpacity/shadowRadius/shadowOffset/elevation
 * collapse to a single CSS box-shadow on web.
 */
export function glow(color: string, radius = 16): CSSProperties {
  const rgba = hexToRgba(color, 0.35);
  return { boxShadow: `0 8px ${radius}px ${rgba}` };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Font family names — must match what's declared in styles/fonts.css
// (@fontsource/poppins), the web equivalent of the original app's
// @expo-google-fonts/poppins useFonts() registration. One family
// throughout, only the weight changes, matching the reference design.
export const FONTS = {
  displayBold: "'Poppins', sans-serif", // 800
  displaySemibold: "'Poppins', sans-serif", // 700
  displayMedium: "'Poppins', sans-serif", // 600
  body: "'Poppins', sans-serif", // 400
  bodyMedium: "'Poppins', sans-serif", // 500
  bodySemibold: "'Poppins', sans-serif", // 600
};

// Matching numeric weights, since CSS needs fontWeight as a separate
// property (RN's font family strings like "Poppins_800ExtraBold"
// encoded the weight in the family name itself).
export const WEIGHTS = {
  displayBold: 800,
  displaySemibold: 700,
  displayMedium: 600,
  body: 400,
  bodyMedium: 500,
  bodySemibold: 600,
};

export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};
