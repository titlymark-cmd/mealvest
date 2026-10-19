import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { COLORS } from "../../styles/theme";
import { Field } from "./Field";

/** Field with a 44px show/hide toggle that has a real accessible name. */
export function PasswordField({
  label,
  noun = "password",
  ...rest
}: { noun?: string } & React.ComponentProps<typeof Field>) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label={label}
      {...rest}
      type={show ? "text" : "password"}
      right={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `Hide ${noun}` : `Show ${noun}`}
          aria-pressed={show}
          style={{ position: "absolute", right: 4, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
        >
          {show ? <EyeOff size={18} color={COLORS.textOnDarkMuted} aria-hidden /> : <Eye size={18} color={COLORS.textOnDarkMuted} aria-hidden />}
        </button>
      }
    />
  );
}
