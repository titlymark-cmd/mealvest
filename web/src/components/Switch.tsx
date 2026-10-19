import React from "react";
import { COLORS } from "../styles/theme";

/** Web equivalent of React Native's <Switch />. */
export function Switch({ value, onValueChange }: { value: boolean; onValueChange: () => void }) {
  return (
    <button
      onClick={onValueChange}
      role="switch"
      aria-checked={value}
      style={{
        width: 52,
        height: 30,
        borderRadius: 15,
        backgroundColor: value ? COLORS.primary : "#CDBBA6",
        boxShadow: "var(--neu-cream-inset)",
        position: "relative",
        transition: "background-color 150ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 25 : 3,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 150ms ease",
        }}
      />
    </button>
  );
}
