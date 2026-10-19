import React, { useId } from "react";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";

/**
 * Labelled text field for dark surfaces. The label is always visible (not a
 * placeholder), the error is tied to the input with aria-describedby, and
 * the recessed "well" look comes from the global input rule in neu.css.
 */
export function Field({
  label,
  value,
  onChange,
  error,
  hint,
  right,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  right?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "style">) {
  const id = useId();
  const msgId = `${id}-msg`;
  const invalid = Boolean(error);
  return (
    <div style={styles.wrap}>
      <label htmlFor={id} style={styles.label}>
        {label}
      </label>
      <div style={styles.row}>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid || hint ? msgId : undefined}
          style={{ ...styles.input, ...(invalid ? styles.invalid : null), ...(right ? { paddingRight: 52 } : null) }}
          {...rest}
        />
        {right}
      </div>
      {(invalid || hint) && (
        <p id={msgId} role={invalid ? "alert" : undefined} style={{ ...styles.msg, color: invalid ? "#FF7A5C" : COLORS.textOnDarkMuted }}>
          {invalid ? error : hint}
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, minWidth: 0 },
  label: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textOnDark },
  row: { position: "relative", display: "flex", alignItems: "center" },
  input: {
    width: "100%",
    minHeight: 52,
    padding: "0 16px",
    borderRadius: RADIUS.md,
    backgroundColor: "#1D1511",
    border: "1.5px solid rgba(255,225,199,0.1)",
    color: COLORS.textOnDark,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    fontSize: 15,
  },
  invalid: { borderColor: "#FF7A5C" },
  msg: { margin: 0, fontFamily: FONTS.body, fontSize: 12, lineHeight: "17px" },
};
