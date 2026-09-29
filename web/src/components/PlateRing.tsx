import React from "react";
import { COLORS } from "../styles/theme";

interface PlateRingProps {
  pct: number; // 0..1
  size?: number;
  stroke?: number;
  trackColor?: string;
  /**
   * Overrides the default brand gradient with a solid status color
   * (e.g. green/orange/red for the student dashboard's daily-credit
   * ring — see utils/dailyCreditStatus.ts). Omit for the default look.
   */
  color?: string;
  children?: React.ReactNode;
}

export function PlateRing({ pct, size = 160, stroke = 14, trackColor = COLORS.borderSoft, color, children }: PlateRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  // Unique per mounted instance so two rings on the same page (however
  // unlikely today) never fight over one <linearGradient id>.
  const gradientId = `plateGradient-${React.useId()}`;

  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color ?? COLORS.primary} />
            <stop offset="100%" stopColor={color ?? COLORS.accent} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c}, ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={styles.center}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
