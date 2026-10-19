import React from "react";
import { COLORS, NEU, RADIUS } from "../styles/theme";

/**
 * Surface hierarchy (see styles/neu.css for the shadow recipes):
 *   cream  — primary card: the main content block on a screen
 *   peach  — secondary card: supporting / highlighted information
 *   dark   — raised espresso panel: lives ON the dark canvas, for
 *            quieter, compact or navigational blocks
 *   well   — recessed cream well, for values sitting INSIDE a card
 * Default stays `cream`, so every existing <Card> keeps working.
 */
export type CardVariant = "cream" | "peach" | "dark" | "well";

export function Card({
  children,
  style,
  variant = "cream",
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  variant?: CardVariant;
  className?: string;
}) {
  return (
    <div className={className} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </div>
  );
}

const base: React.CSSProperties = { borderRadius: RADIUS.lg, padding: 18, minWidth: 0 };

const variants: Record<CardVariant, React.CSSProperties> = {
  cream: { backgroundColor: COLORS.card, boxShadow: NEU.creamRaised, color: COLORS.text },
  peach: { backgroundColor: COLORS.accentSoft, boxShadow: NEU.creamRaisedSm, color: COLORS.text },
  dark: { backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaised, color: COLORS.textOnDark, border: "1px solid var(--mv-hairline)" },
  well: { backgroundColor: "#F4E8D8", boxShadow: NEU.creamInset, color: COLORS.text, borderRadius: RADIUS.md, padding: 14 },
};
