import React from "react";
import { COLORS, FONTS } from "../styles/theme";
import logoSrc from "../assets/mealvest-logo.png";

export function Logo({ size = "md", dark = false }: { size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const dims = { sm: 30, md: 38, lg: 50 }[size];
  const textSize = { sm: 15, md: 18, lg: 24 }[size];

  return (
    <div style={styles.row}>
      <img src={logoSrc} alt="MEALVEST" style={{ width: dims, height: dims, objectFit: "contain" }} />
      <span
        style={{
          ...styles.wordmark,
          fontSize: textSize,
          color: dark ? COLORS.text : COLORS.textOnDark,
        }}
      >
        MEALVEST
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontFamily: FONTS.displayBold, fontWeight: 800, letterSpacing: 0.5 },
};
