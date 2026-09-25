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
        width: 44,
        height: 26,
        borderRadius: 13,
        backgroundColor: value ? COLORS.primary : COLORS.borderSoft,
        position: "relative",
        transition: "background-color 150ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 20 : 2,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 150ms ease",
        }}
      />
    </button>
  );
}
