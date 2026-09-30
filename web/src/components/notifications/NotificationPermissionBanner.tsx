import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { isPushSupported, getPermissionState, enablePush } from "../../services/pushNotifications";

const DISMISSED_KEY = "mealvest_notif_banner_dismissed";

/**
 * The polished, opt-in permission prompt — never the raw browser
 * permission dialog thrown up unprompted. Only renders when there's
 * something genuine to ask: push is actually supported+configured on
 * this deployment, permission hasn't already been decided either way
 * (granted or denied), and the student hasn't dismissed it before
 * (remembered per-browser via localStorage — a convenience the banner
 * itself degrades gracefully without if storage is blocked).
 */
export function NotificationPermissionBanner() {
  const { authFetch } = useAuth();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (getPermissionState() !== "default") return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // Storage blocked — just show the banner every time; not worth failing over.
    }
    setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Fine — it'll just show again next visit.
    }
  };

  const handleEnable = async () => {
    setError(null);
    setEnabling(true);
    const result = await enablePush(authFetch);
    setEnabling(false);
    if (result.ok) {
      setVisible(false);
    } else if (result.reason === "permission_denied") {
      // The browser itself now owns this decision — dismiss our
      // banner permanently rather than nagging again next visit.
      dismiss();
    } else {
      setError(result.message);
    }
  };

  if (!visible) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.iconCircle}>
        <Bell size={18} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={styles.title}>Stay connected with MEALVEST</span>
        <p style={styles.subtitle}>Get important updates about your daily meal budget, payments, meal passes, wallet activity, and announcements.</p>
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.btnRow}>
          <button onClick={handleEnable} disabled={enabling} style={styles.enableBtn}>
            <span style={styles.enableText}>{enabling ? "Enabling…" : "Enable Notifications"}</span>
          </button>
          <button onClick={dismiss} style={styles.laterBtn}>
            <span style={styles.laterText}>Maybe Later</span>
          </button>
        </div>
      </div>
      <button onClick={dismiss} style={styles.closeBtn} aria-label="Dismiss">
        <X size={16} color={COLORS.textOnDarkMuted} />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 20,
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    position: "relative",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { display: "block", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 15, color: "#fff" },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 12, lineHeight: "18px" },
  error: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: "#fff", backgroundColor: "rgba(0,0,0,0.2)", padding: "6px 10px", borderRadius: RADIUS.sm, marginBottom: 10 },
  btnRow: { display: "flex", flexDirection: "row", gap: 10, flexWrap: "wrap" },
  enableBtn: { backgroundColor: "#fff", borderRadius: RADIUS.pill, padding: "9px 16px" },
  enableText: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 12, color: COLORS.primaryDark },
  laterBtn: { padding: "9px 12px" },
  laterText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  closeBtn: { position: "absolute", top: 10, right: 10, padding: 4, flexShrink: 0 },
};
