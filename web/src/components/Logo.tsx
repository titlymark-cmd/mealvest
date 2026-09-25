import React from "react";
import { COLORS, FONTS } from "../styles/theme";
import logoSrc from "../assets/mealvest-logo.png";

/**
 * `animated` plays the dark -> glow -> full-color + shine "reveal"
 * once on mount (see styles/effects.css's .mv-logo-reveal-wrap) —
 * reserved for first-impression moments (splash, Welcome's big logo),
 * not passed on the small header logo that's on screen constantly.
 */
export function Logo({ size = "md", dark = false, animated = false }: { size?: "sm" | "md" | "lg"; dark?: boolean; animated?: boolean }) {
  const dims = { sm: 30, md: 38, lg: 50 }[size];
  const textSize = { sm: 15, md: 18, lg: 24 }[size];

  const image = (
    <img src={logoSrc} alt="MEALVEST" style={{ width: dims, height: dims, objectFit: "contain" }} />
  );

  return (
    <div style={styles.row}>
      {animated ? (
        <div
          className="mv-logo-reveal-wrap"
          style={{ width: dims, height: dims, ["--mv-logo-url" as string]: `url(${logoSrc})` } as React.CSSProperties}
        >
          {image}
        </div>
      ) : (
        image
      )}
      <span
        className={animated ? "mv-wordmark-reveal" : undefined}
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
