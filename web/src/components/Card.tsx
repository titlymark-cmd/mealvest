import React from "react";
import { COLORS, RADIUS } from "../styles/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...styles.card, ...style }}>{children}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    padding: 16,
    // Two-layer shadow (a tight contact shadow + a softer ambient
    // one) reads as more considered than a single flat blur — same
    // trick real design systems use for card depth.
    boxShadow: "0 1px 2px rgba(29,21,17,0.12), 0 8px 20px rgba(29,21,17,0.16)",
  },
};
