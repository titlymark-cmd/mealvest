import React, { useState } from "react";
import { Sparkles, X, MessageSquare, ArrowLeftRight, HeartHandshake } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../styles/theme";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "SMS Notifications",
    body: "Important alerts — payment confirmations, low-balance warnings, security alerts — sent straight to your phone by SMS. Works even without data.",
  },
  {
    icon: ArrowLeftRight,
    title: "Inter-Hotel Transfer",
    body: "Switch your active meal plan to a different MealVest hotel for a small fee, without losing your remaining balance.",
  },
  {
    icon: HeartHandshake,
    title: "Niokolee",
    body: "Lend a fellow comrade some help when their daily plan runs low, or ask for help yourself — peer support, built right into MealVest.",
  },
];

/**
 * Small floating badge, visible on every screen inside the dashboard
 * shells (see routes/StudentRoutes.tsx) — a gentle breathing glow (see
 * styles/effects.css's mv-comingsoon-pulse) rather than a flashing
 * "urgent" pulse, so it reads as an invitation to explore rather than
 * an alert. Opens a panel listing features that are either waiting on
 * external setup (SMS needs Africa's Talking credentials) or still
 * planned (Inter-Hotel Transfer, Niokolee) — kept in ONE place here so
 * the list only needs updating in one spot as features actually ship.
 */
export function ComingSoonBadge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mv-comingsoon-badge"
        style={styles.badge}
        aria-label="Coming soon features"
      >
        <Sparkles size={18} color="#fff" />
      </button>

      {open && (
        <div style={styles.overlay} onClick={() => setOpen(false)}>
          <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <div style={{ minWidth: 0 }}>
                <h2 style={styles.title}>Coming soon</h2>
                <p style={styles.subtitle}>A few things we're still building for you.</p>
              </div>
              <button onClick={() => setOpen(false)} style={styles.closeBtn} aria-label="Close">
                <X size={18} color={COLORS.textMuted} />
              </button>
            </div>

            <div style={styles.list}>
              {FEATURES.map((f) => (
                <div key={f.title} style={styles.item}>
                  <div style={styles.itemIconCircle}>
                    <f.icon size={16} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.itemTitle}>{f.title}</span>
                    <span style={styles.itemBody}>{f.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    position: "fixed",
    right: 16,
    bottom: 88,
    zIndex: 55,
    width: 46,
    height: 46,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    flexShrink: 0,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(29,21,17,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 200,
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 22,
    width: "100%",
    maxWidth: 440,
    maxHeight: "85vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },
  header: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 19, color: COLORS.text, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  closeBtn: { padding: 4, flexShrink: 0 },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  item: { display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-start" },
  itemIconCircle: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    flexShrink: 0,
  },
  itemTitle: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 14, color: COLORS.text },
  itemBody: { display: "block", fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: "18px" },
};
