import React from "react";
import { Check } from "lucide-react";

/**
 * Terms agreement control.
 *
 * Root cause of the earlier bug: the old control was a <button> with a
 * <div> "box" whose inline style mixed the `border` shorthand with a
 * conditional `borderColor` longhand. Unchecking removed `borderColor`, which
 * made the browser drop the border colour to black on the espresso
 * background (the box "vanished"), and the button never exposed
 * role/checked state to assistive tech.
 *
 * This is a real <input type="checkbox"> paired with a real <label>, so
 * clicking the box OR the text toggles it, Space toggles it from the
 * keyboard, and screen readers announce checked/invalid state. All visuals
 * are CSS driven off the input (see .ob-check in onboarding.css). Links
 * for the full terms live outside the label so opening them can never
 * toggle the box.
 */
export function TermsCheckbox({
  id,
  checked,
  onChange,
  disabled,
  invalid,
  describedBy,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ob-check">
      <input
        id={id}
        className="ob-check-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="ob-check-label">
        <span className="ob-check-box" aria-hidden="true">
          <Check size={18} strokeWidth={3} />
        </span>
        <span>{children}</span>
      </label>
    </div>
  );
}
