import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UtensilsCrossed, Share2, SquarePlus, CheckCircle2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS, GRADIENT, glow } from "../styles/theme";

/** iOS Safari never fires beforeinstallprompt — this is the only reliable way to branch. */
function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  // iPadOS 13+ reports as "MacIntel" in Safari but is touch-capable, unlike a real Mac.
  const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadDesktopMode;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true
  );
}

/**
 * A dedicated, unauthenticated, direct-URL-only "install this PWA"
 * page — deliberately NOT the login screen and NOT reachable from any
 * nav/redirect (see RootGate.tsx, which routes /install here before
 * any splash/auth logic runs at all). Exists so a QR code, a text
 * link, etc. can point someone straight at "add Mealvest to your home
 * screen" without first making them sign in or sit through the splash.
 */
export default function InstallScreen() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") setDismissed(true);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }, [deferredPrompt]);

  return (
    <div style={styles.page}>
      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      <div style={styles.card}>
        <Logo size="lg" dark animated />

        <div style={styles.badge}>
          <UtensilsCrossed size={20} color="#fff" />
        </div>

        {installed ? (
          <>
            <h1 style={styles.title}>Mealvest is already installed</h1>
            <p style={styles.tagline}>Good food. Smarter spending. Less stress.</p>
          </>
        ) : (
          <>
            <h1 style={styles.title}>Welcome to Mealvest</h1>
            <p style={styles.tagline}>Good food. Smarter spending. Less stress.</p>
            <p style={styles.subtext}>Plan your meals. Keep your spending in check. Enjoy your food.</p>
          </>
        )}

        {installed ? (
          <PrimaryButton onPress={() => navigate("/")} showArrow={false} style={{ marginTop: 24 }}>
            Open Mealvest
          </PrimaryButton>
        ) : ios ? (
          <div style={styles.iosBlock}>
            <span style={styles.iosTitle}>Install Mealvest</span>
            <div style={styles.iosStep}>
              <div style={styles.iosStepIcon}>
                <Share2 size={16} color={COLORS.primary} />
              </div>
              <span style={styles.iosStepText}>
                1. Tap the <strong>Share</strong> button in Safari
              </span>
            </div>
            <div style={styles.iosStep}>
              <div style={styles.iosStepIcon}>
                <SquarePlus size={16} color={COLORS.primary} />
              </div>
              <span style={styles.iosStepText}>
                2. Select <strong>Add to Home Screen</strong>
              </span>
            </div>
            <div style={styles.iosStep}>
              <div style={styles.iosStepIcon}>
                <CheckCircle2 size={16} color={COLORS.primary} />
              </div>
              <span style={styles.iosStepText}>
                3. Tap <strong>Add</strong>
              </span>
            </div>
          </div>
        ) : deferredPrompt ? (
          <>
            <PrimaryButton onPress={handleInstall} loading={installing} showArrow={false} style={{ marginTop: 24 }}>
              Install Mealvest
            </PrimaryButton>
            <span style={styles.footnote}>Free to install · Takes a moment</span>
          </>
        ) : (
          <>
            {/* Browser hasn't offered beforeinstallprompt (criteria not met yet,
                already dismissed this session, or unsupported browser) — never
                show a button that can't actually trigger installation. */}
            <PrimaryButton onPress={() => navigate("/")} showArrow={false} style={{ marginTop: 24 }}>
              Open Mealvest
            </PrimaryButton>
            <span style={styles.footnote}>
              {dismissed
                ? "No worries — you can install any time from your browser menu."
                : "Look for \"Add to Home Screen\" or \"Install app\" in your browser's menu."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100vh",
    width: "100%",
    backgroundColor: COLORS.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    overflow: "hidden",
  },
  glowTop: {
    position: "absolute",
    top: -120,
    left: "50%",
    transform: "translateX(-50%)",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${GRADIENT[1]}55, transparent 70%)`,
    pointerEvents: "none",
  },
  glowBottom: {
    position: "absolute",
    bottom: -140,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${COLORS.accent}40, transparent 70%)`,
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    width: "100%",
    maxWidth: 400,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: "36px 28px 30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
    marginTop: 18,
    marginBottom: 4,
    ...glow(COLORS.primary, 12),
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 24, color: COLORS.text, margin: "14px 0 0 0", lineHeight: "30px" },
  tagline: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.primary, margin: "8px 0 0 0" },
  subtext: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, margin: "10px 0 0 0", lineHeight: "19px" },
  footnote: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textFaint, marginTop: 12, lineHeight: "16px" },
  iosBlock: { width: "100%", marginTop: 22, display: "flex", flexDirection: "column", gap: 10 },
  iosTitle: { fontFamily: FONTS.displaySemibold, fontWeight: 700, fontSize: 14, color: COLORS.text, textAlign: "left", marginBottom: 2 },
  iosStep: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.cardWhite,
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.sm,
    padding: "10px 12px",
    textAlign: "left",
  },
  iosStepIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iosStepText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 13, color: COLORS.text },
};
