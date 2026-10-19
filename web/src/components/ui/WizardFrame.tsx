import React, { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS, FONTS, NEU, RADIUS } from "../../styles/theme";
import { StepProgress } from "./StepProgress";
import { PrimaryButton } from "../PrimaryButton";

/**
 * One consistent frame for every onboarding step: back control, progress,
 * a heading that receives focus on each step change (screen readers hear
 * the new step), the step body, and an action footer that stays reachable
 * while the mobile keyboard is open.
 */
export function WizardFrame({
  step,
  total,
  stepTitle,
  heading,
  intro,
  direction,
  onBack,
  onNext,
  nextLabel,
  nextLoading,
  nextDisabled,
  nextArrow = true,
  error,
  children,
  aside,
}: {
  step: number;
  total: number;
  stepTitle: string;
  heading: string;
  intro?: string;
  direction: "fwd" | "back";
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextLoading?: boolean;
  nextDisabled?: boolean;
  nextArrow?: boolean;
  error?: string | null;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      style={styles.form}
    >
      <div style={styles.topRow}>
        {onBack ? (
          <button type="button" onClick={onBack} style={styles.back} aria-label="Go back">
            <ArrowLeft size={18} aria-hidden />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <StepProgress step={step} total={total} title={stepTitle} />
        </div>
      </div>

      <div key={step} className={direction === "fwd" ? "mv-step-fwd" : "mv-step-back"} style={styles.body}>
        <h1 ref={headingRef} tabIndex={-1} style={styles.heading}>
          {heading}
        </h1>
        {intro && <p style={styles.intro}>{intro}</p>}
        {aside}
        <div style={{ marginTop: 22 }}>{children}</div>
        {error && (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        )}
      </div>

      <div style={styles.footer}>
        <PrimaryButton type="submit" loading={nextLoading} disabled={nextDisabled} showArrow={nextArrow}>
          {nextLabel}
        </PrimaryButton>
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", minHeight: "100%" },
  topRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20, position: "sticky", top: 0, zIndex: 2, padding: "8px 0 12px", background: "linear-gradient(180deg, #1D1511 82%, rgba(29,21,17,0))" },
  back: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NEU.surfaceDark,
    boxShadow: NEU.darkRaisedSm,
    color: COLORS.textOnDark,
    flexShrink: 0,
  },
  body: { flex: 1 },
  heading: { margin: 0, fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 26, lineHeight: "33px", color: COLORS.textOnDark, outline: "none" },
  intro: { margin: "10px 0 0", fontFamily: FONTS.body, fontSize: 14, lineHeight: "21px", color: COLORS.textOnDarkMuted },
  error: {
    margin: "6px 0 0",
    padding: "12px 14px",
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(229,72,46,0.12)",
    border: "1px solid rgba(229,72,46,0.5)",
    color: "#FF9A82",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 13,
  },
  // Sticks to the bottom of the scroll pane so it stays above the keyboard
  // area on short viewports; the gradient keeps scrolled fields legible.
  footer: {
    position: "sticky",
    bottom: 0,
    paddingTop: 16,
    paddingBottom: "calc(16px + var(--safe-bottom))",
    background: "linear-gradient(180deg, rgba(29,21,17,0), #1D1511 38%)",
    marginTop: 12,
  },
};
