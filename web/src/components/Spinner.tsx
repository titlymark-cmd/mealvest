import React from "react";

/**
 * Web equivalent of React Native's <ActivityIndicator /> — same
 * call sites (loading buttons, full-screen loaders) just swap the
 * import. Size/color match RN's ActivityIndicator API loosely (RN's
 * "small"/"large" sizes map to concrete pixel sizes here).
 */
export function Spinner({ color = "#fff", size = "small" }: { color?: string; size?: "small" | "large" | number }) {
  const px = typeof size === "number" ? size : size === "large" ? 36 : 20;
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        border: `${Math.max(2, px / 10)}px solid ${color}33`,
        borderTopColor: color,
        animation: "mv-spin 0.8s linear infinite",
      }}
    />
  );
}
