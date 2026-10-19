import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Store, Wallet, QrCode, CalendarCheck, PiggyBank, GraduationCap, Building2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { Card } from "../components/Card";
import { COLORS, FONTS, NEU } from "../styles/theme";

/**
 * Public landing page (/welcome). Every claim here is something the app
 * actually does today: hotel-funded meal plans, a daily amount, rollover,
 * a QR meal pass, hotel partner accounts. No statistics or testimonials.
 */
export default function WelcomeScreen() {
  const navigate = useNavigate();
  return (
    <div style={styles.page}>
      <header className="mv-container" style={styles.nav}>
        <Logo size="md" />
        <div style={{ width: 120 }}>
          <PrimaryButton variant="secondary" type="button" showArrow={false} onPress={() => navigate("/login")} style={{ minHeight: 44 }}>
            Sign in
          </PrimaryButton>
        </div>
      </header>

      <main>
        <section className="mv-container mv-landing-hero">
          <div style={{ minWidth: 0 }}>
            <h1 style={styles.h1}>Your food money, already planned.</h1>
            <p style={styles.lead}>Fund a meal plan with a hotel you trust. MEALVEST spreads it into a daily amount, so your money lasts the whole plan, and you eat by showing a QR meal pass.</p>
            <div style={styles.ctas}>
              <PrimaryButton type="button" onPress={() => navigate("/register/student")}>
                I'm a student — create account
              </PrimaryButton>
              <PrimaryButton variant="secondary" type="button" showArrow={false} onPress={() => navigate("/register/hotel")} icon={<Building2 size={18} aria-hidden />}>
                Register a hotel
              </PrimaryButton>
            </div>
          </div>

          {/* Product preview: structural illustration only — no balances, no data. */}
          <div className="neu-dark" style={styles.preview} aria-hidden>
            <div style={styles.previewRing}>
              <div style={styles.previewRingInner}>
                <QrCode size={52} color={COLORS.textOnDark} />
              </div>
            </div>
            <div style={styles.previewRow}>
              <span style={styles.previewPill} />
              <span style={{ ...styles.previewPill, width: "40%", backgroundColor: COLORS.primary }} />
            </div>
          </div>
        </section>

        <section className="mv-container" style={{ paddingTop: 56 }}>
          <h2 style={styles.h2}>How it works</h2>
          <div className="mv-landing-grid">
            {[
              { icon: Store, t: "Pick a hotel", d: "Choose from participating hotels and see their menu." },
              { icon: Wallet, t: "Fund your plan", d: "Pay for a plan and get a daily amount to eat on." },
              { icon: QrCode, t: "Show your meal pass", d: "Order, then show your QR code to the hotel to redeem." },
            ].map(({ icon: Icon, t, d }) => (
              <Card key={t} variant="cream">
                <span style={styles.cardIcon}>
                  <Icon size={22} color={COLORS.primary} aria-hidden />
                </span>
                <h3 style={styles.h3}>{t}</h3>
                <p style={styles.cardP}>{d}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mv-container" style={{ paddingTop: 40 }}>
          <div className="mv-landing-grid mv-landing-two">
            <Card variant="peach">
              <GraduationCap size={26} color={COLORS.primary} aria-hidden />
              <h3 style={styles.h3}>For students</h3>
              <ul style={styles.list}>
                <li><CalendarCheck size={16} aria-hidden /> A daily amount, so money lasts the plan</li>
                <li><PiggyBank size={16} aria-hidden /> Unspent daily balance can roll over</li>
                <li><QrCode size={16} aria-hidden /> Pay with a QR meal pass</li>
              </ul>
            </Card>
            <Card variant="dark">
              <Building2 size={26} color={COLORS.accent} aria-hidden />
              <h3 style={{ ...styles.h3, color: COLORS.textOnDark }}>For hotels</h3>
              <ul style={{ ...styles.list, color: COLORS.textOnDarkMuted }}>
                <li><QrCode size={16} aria-hidden /> Scan and redeem student meal passes</li>
                <li><Wallet size={16} aria-hidden /> Payouts to M-Pesa or your bank, verified by an admin first</li>
                <li><Store size={16} aria-hidden /> Manage your menu and see your orders</li>
              </ul>
            </Card>
          </div>
        </section>
      </main>

      <footer className="mv-container" style={styles.footer}>
        <Logo size="sm" />
        <nav aria-label="Footer" style={styles.footLinks}>
          <Link to="/login">Sign in</Link>
          <Link to="/demo">Watch the demo</Link>
          <Link to="/terms">Terms &amp; privacy</Link>
          <Link to="/install">Install the app</Link>
        </nav>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, paddingBottom: "calc(24px + var(--safe-bottom))" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "calc(16px + var(--safe-top))", paddingBottom: 16 },
  h1: { margin: 0, fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: "clamp(32px, 8vw, 54px)", lineHeight: 1.12, color: COLORS.textOnDark, letterSpacing: -0.5 },
  lead: { margin: "18px 0 28px", fontFamily: FONTS.body, fontSize: 16, lineHeight: "26px", color: COLORS.textOnDarkMuted, maxWidth: 520 },
  ctas: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 },
  preview: { padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, borderRadius: 30 },
  previewRing: { width: 190, height: 190, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: NEU.surfaceDark, boxShadow: NEU.darkRaised },
  previewRingInner: { width: 130, height: 130, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
  previewRow: { width: "100%", display: "flex", gap: 12 },
  previewPill: { flex: 1, height: 14, borderRadius: 7, backgroundColor: "#1D1511", boxShadow: NEU.darkInset },
  h2: { margin: "0 0 20px", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 26, color: COLORS.textOnDark },
  h3: { margin: "12px 0 6px", fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 18, color: COLORS.text },
  cardP: { margin: 0, fontFamily: FONTS.body, fontSize: 14, lineHeight: "21px", color: COLORS.textMuted },
  cardIcon: { width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accentSoft, boxShadow: NEU.creamInset },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body, fontSize: 14, color: COLORS.textMuted },
  footer: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 56, paddingTop: 24, borderTop: "1px solid var(--mv-hairline)" },
  footLinks: { display: "flex", flexWrap: "wrap", gap: 4, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.textOnDarkMuted },
};
