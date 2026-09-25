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
    boxShadow: "0 4px 12px rgba(29,21,17,0.18)",
  },
};
