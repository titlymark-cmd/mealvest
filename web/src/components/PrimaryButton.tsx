import React from "react";
import { ChevronRight } from "lucide-react";
import { COLORS, FONTS, NEU, RADIUS } from "../styles/theme";
import { Spinner } from "./Spinner";

/**
 * The one MEALVEST button.
 *   primary   — tomato, raised; compresses into an inset on press
 *   secondary — raised espresso surface, for the quieter action beside a primary
 *   ghost     — text-only, for tertiary links
 * `type` defaults to the browser default (submit inside a <form>) because
 * existing forms rely on this button submitting them.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
  showArrow = true,
  style,
  variant = "primary",
  type,
  icon,
  ariaLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  showArrow?: boolean;
  style?: React.CSSProperties;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  icon?: React.ReactNode;
  ariaLabel?: string;
}) {
  const isDisabled = disabled || loading;
  const v = variants[variant];
  return (
    <button
      type={type}
      onClick={onPress}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={`mv-btn mv-btn-${variant}`}
      style={{ ...styles.base, ...v, ...(isDisabled ? styles.disabled : null), ...style }}
    >
      {loading ? (
        <Spinner color={variant === "primary" ? "#fff" : COLORS.primaryLight} />
      ) : (
        <>
          {icon}
          <span style={{ ...styles.text, color: v.color }}>{children}</span>
          {showArrow && variant !== "ghost" && <ChevronRight size={18} color={v.color as string} aria-hidden />}
        </>
      )}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    width: "100%",
    minHeight: 52,
    borderRadius: RADIUS.md,
    padding: "0 20px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: FONTS.bodySemibold,
  },
  text: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 15 },
  // Disabled keeps its shape and loses its depth: flat, dimmed, not clickable.
  disabled: { opacity: 0.5, boxShadow: "none", cursor: "not-allowed", filter: "saturate(0.6)" },
};

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: `linear-gradient(160deg, ${COLORS.primaryLight} -40%, ${COLORS.primary} 55%)`, color: "#fff", boxShadow: NEU.action },
  secondary: { backgroundColor: NEU.surfaceDark2, color: COLORS.textOnDark, boxShadow: NEU.darkRaisedSm, border: "1px solid var(--mv-hairline)" },
  ghost: { backgroundColor: "transparent", color: COLORS.primaryLight, boxShadow: "none", minHeight: 44 },
};
