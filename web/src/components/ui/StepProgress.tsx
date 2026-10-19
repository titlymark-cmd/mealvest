import React from "react";
import { COLORS, FONTS } from "../../styles/theme";

/** Segmented progress: completed steps are filled, the current one is amber. */
export function StepProgress({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={`Step ${step} of ${total}: ${title}`}
        style={{ display: "flex", gap: 6 }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const done = i + 1 < step;
          const current = i + 1 === step;
          return (
            <span
              key={i}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: done ? COLORS.primary : current ? COLORS.accent : "#1D1511",
                boxShadow: done || current ? "none" : "var(--neu-dark-inset)",
                transition: "background-color 320ms var(--mv-ease)",
              }}
            />
          );
        })}
      </div>
      <p style={{ margin: "10px 0 0", fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 12, color: COLORS.textOnDarkMuted }}>
        Step {step} of {total} · {title}
      </p>
    </div>
  );
}
