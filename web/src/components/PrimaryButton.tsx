import React from "react";
import { ChevronRight } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT, glow } from "../styles/theme";
import { Spinner } from "./Spinner";

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
  showArrow = true,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  showArrow?: boolean;
  style?: React.CSSProperties;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      onClick={onPress}
      disabled={isDisabled}
      style={{
        ...styles.wrapper,
        ...(isDisabled ? styles.disabled : null),
        ...style,
      }}
    >
      <div style={styles.gradient}>
        {loading ? (
          <Spinner color="#fff" />
        ) : (
          <>
            <span style={styles.text}>{children}</span>
            {showArrow && <ChevronRight size={18} color="#fff" />}
          </>
        )}
      </div>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    borderRadius: RADIUS.sm,
    width: "100%",
    ...glow(COLORS.primary, 14),
  },
  disabled: { opacity: 0.45, boxShadow: "none" },
  gradient: {
    borderRadius: RADIUS.sm,
    paddingTop: 15,
    paddingBottom: 15,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  text: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 15 },
};
