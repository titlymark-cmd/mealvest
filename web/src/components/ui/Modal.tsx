import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { COLORS, FONTS, NEU, RADIUS, Z } from "../../styles/theme";

/**
 * Accessible dialog: role=dialog + aria-modal, Escape / backdrop to close,
 * focus moves in on open and returns to the opener on close, Tab is kept
 * inside. On phones it rises from the bottom as a sheet; on larger screens
 * it is a centred card.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
  icon,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Callers usually pass an inline `() => ...` for onClose, which is a new
  // function on every render. Keeping it in a ref lets the effect below run
  // only when the dialog opens or closes. Depending on onClose directly made
  // the effect re-run on every keystroke in a form inside the dialog, which
  // re-focused the first control and pulled the cursor out of the field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="mv-modal-backdrop" style={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="mv-modal-panel" style={styles.panel}>
        {icon && <div style={styles.icon}>{icon}</div>}
        <h2 style={styles.title}>{title}</h2>
        <div style={styles.body}>{children}</div>
        {actions && <div style={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: Z.modal,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "16px 16px calc(16px + var(--safe-bottom))",
    backgroundColor: "rgba(15,10,8,0.72)",
  },
  panel: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "calc(100% - 32px)",
    overflowY: "auto",
    padding: 24,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.card,
    boxShadow: NEU.creamRaised,
    color: COLORS.text,
    outline: "none",
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentSoft,
    boxShadow: NEU.creamInset,
    marginBottom: 14,
  },
  title: { margin: 0, fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, lineHeight: "26px", color: COLORS.text },
  body: { marginTop: 8, fontFamily: FONTS.body, fontSize: 14, lineHeight: "21px", color: COLORS.textMuted },
  actions: { display: "flex", flexDirection: "column", gap: 10, marginTop: 20 },
};