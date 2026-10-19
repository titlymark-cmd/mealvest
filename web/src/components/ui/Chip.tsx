import React from "react";
import { Check } from "lucide-react";
import { COLORS, FONTS, NEU, RADIUS } from "../../styles/theme";

/**
 * Selectable option. Selected = pressed-in + tomato edge + check icon, so
 * the state never depends on colour alone.
 */
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      style={{
        minHeight: 44,
        padding: "0 16px",
        borderRadius: RADIUS.pill,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONTS.bodySemibold,
        fontWeight: 600,
        fontSize: 13,
        color: active ? COLORS.textOnDark : COLORS.textOnDarkMuted,
        backgroundColor: active ? "#1D1511" : NEU.surfaceDark2,
        boxShadow: active ? NEU.darkPressed : NEU.darkRaisedSm,
        border: `1.5px solid ${active ? COLORS.primary : "var(--mv-hairline)"}`,
      }}
    >
      {active && <Check size={14} color={COLORS.accent} aria-hidden />}
      {label}
    </button>
  );
}
