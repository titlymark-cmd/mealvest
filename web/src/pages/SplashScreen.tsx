import React, { useEffect } from "react";
import { COLORS, FONTS, glow } from "../styles/theme";
import logoSrc from "../assets/mealvest-logo.png";

// Bumped from 1400ms so the logo-reveal animation (1500ms) plus the
// staggered wordmark/tagline fade have room to finish before the app
// navigates away, instead of getting cut off mid-animation.
const MIN_SPLASH_MS = 1900;

export function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <div style={styles.container}>
      <div
        className="mv-logo-reveal-wrap"
        style={{ ...styles.badge, ...glow(COLORS.primary, 24), ["--mv-logo-url" as string]: `url(${logoSrc})` } as React.CSSProperties}
      >
        <img src={logoSrc} alt="" style={styles.badgeImage} />
      </div>
      <span className="mv-wordmark-reveal" style={styles.wordmark}>
        MEALVEST
      </span>
      <span className="mv-wordmark-reveal" style={{ ...styles.tagline, animationDelay: "1150ms" }}>
        Your food money, already planned.
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(180deg, ${COLORS.bgDeep}, ${COLORS.bg})`,
  },
  badge: {
    width: 96,
    height: 96,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badgeImage: { width: 96, height: 96, objectFit: "contain" },
  wordmark: { fontSize: 24, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, letterSpacing: 2 },
  tagline: {
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    color: COLORS.accent,
    marginTop: 8,
    letterSpacing: 0.6,
  },
};
