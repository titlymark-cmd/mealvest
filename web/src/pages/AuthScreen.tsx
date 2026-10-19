import React, { useState } from "react";
import { Store, QrCode, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { COLORS, FONTS, NEU, RADIUS } from "../styles/theme";
import { LoginFormContent } from "./LoginFormContent";
import { StudentSignupWizard } from "./StudentSignupWizard";
import { HotelSignupWizard } from "./HotelSignupWizard";

type Mode = "login" | "register-student" | "register-hotel";

/**
 * Login / student sign-up / hotel sign-up share ONE persistently-mounted
 * screen (the three routes differ only by initial `mode`), so switching
 * between them is local state, not a route swap. Desktop pairs the form
 * pane with a brand panel; phones get a single column.
 */
export default function AuthScreen({ mode: initialMode }: { mode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const toLogin = () => setMode("login");
  const toRegister = (role: "student" | "hotel") => setMode(role === "hotel" ? "register-hotel" : "register-student");

  return (
    <div className="mv-auth-root">
      <aside className="mv-auth-brand" aria-hidden={false}>
        <Link to="/" aria-label="MEALVEST home" style={{ display: "inline-flex" }}>
          <Logo size="md" />
        </Link>
        <div style={{ marginTop: "auto" }}>
          <h2 style={styles.hero}>Good food, brighter days</h2>
          <p style={styles.heroSub}>Fund a meal plan with hotels you trust and eat well every single day.</p>
          <ol style={styles.steps}>
            {[
              { icon: Store, t: "Pick a hotel you trust" },
              { icon: Wallet, t: "Fund a plan, get a daily amount" },
              { icon: QrCode, t: "Show your meal pass to eat" },
            ].map(({ icon: Icon, t }) => (
              <li key={t} style={styles.step}>
                <span style={styles.stepIcon}>
                  <Icon size={18} color={COLORS.accent} aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <main className="mv-auth-pane">
        <div className="mv-auth-mobilelogo">
          <Link to="/" aria-label="MEALVEST home" style={{ display: "inline-flex" }}>
            <Logo size="sm" />
          </Link>
        </div>
        <div key={mode} className="mv-page" style={styles.content}>
          {mode === "login" && <LoginFormContent onSwitchToRegister={toRegister} />}
          {mode === "register-student" && <StudentSignupWizard onSwitchToLogin={toLogin} />}
          {mode === "register-hotel" && <HotelSignupWizard onSwitchToLogin={toLogin} />}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  content: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", margin: "auto 0", minHeight: 0 },
  hero: { margin: 0, fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 38, lineHeight: "46px", color: COLORS.textOnDark, maxWidth: 420 },
  heroSub: { margin: "14px 0 28px", fontFamily: FONTS.body, fontSize: 15, lineHeight: "23px", color: COLORS.textOnDarkMuted, maxWidth: 400 },
  steps: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 },
  step: { display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: RADIUS.md, backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaisedSm, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.textOnDark },
  stepIcon: { width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
};
