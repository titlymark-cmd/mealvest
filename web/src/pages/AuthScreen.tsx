import React, { useState } from "react";
import { Logo } from "../components/Logo";
import { COLORS, FONTS } from "../styles/theme";
import { LoginFormContent } from "./LoginFormContent";
import { RegisterFormContent } from "./RegisterFormContent";
import { useWindowSize } from "../hooks/useWindowSize";

type Mode = "login" | "register-student" | "register-hotel";

// Same photos the UI/UX reference design used for the two auth hero
// panels — reused as-is per the design brief rather than substituted.
const IMG_LOGIN_HERO = "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1000&q=80&auto=format&fit=crop";
const IMG_REGISTER_HERO = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=70&auto=format&fit=crop";

const DESKTOP_BREAKPOINT = 900;
const SLIDE_MS = 900;
const EASE = "cubic-bezier(.65,0,.35,1)";

// Outer padding from the true screen edge, plus the wider of the two form
// components' own maxWidth (RegisterFormContent's is 420) — this is the
// furthest a form's content can ever reach in from that edge.
const FORM_PADDING = 64;
const FORM_SAFE_EDGE = FORM_PADDING + 420;

/**
 * The diagonal boundary spans the FULL screen (not just the hero image),
 * and is computed from the viewport's own height rather than a fixed
 * percentage of its width — over one screen-height of vertical travel it
 * moves exactly one screen-height sideways, so the line stays a genuine
 * ~45 degrees at any desktop window size instead of drifting flatter or
 * steeper as the window gets wider or narrower.
 *
 * `formTopOffset` is solved directly from that same boundary equation: the
 * minimum distance from the top of the screen at which a form's content
 * can start appearing while staying guaranteed inside the wide part of its
 * own trapezoid — at any window size and for a form of any length (a long
 * hotel registration form just scrolls further before it's fully visible).
 */
function diagonalGeometry(width: number, height: number) {
  const half = height / 2;
  const center = width / 2;
  const narrowX = center - half;
  const wideX = center + half;
  const formTopOffset = Math.max(48, FORM_SAFE_EDGE - narrowX);
  return { narrowX, wideX, formTopOffset };
}

/**
 * The Login/Register experience — one persistently-mounted component
 * (not swapped by the router) so the diagonal-split transition
 * between them can actually animate. "/login", "/register/student"
 * and "/register/hotel" all render this same component with a
 * different initial `mode` prop (see routes/AppRoutes.tsx); switching
 * between Login and Register from WITHIN this screen changes local
 * state instead of navigating, which is what makes the animation
 * possible.
 *
 * All actual auth logic (validation, API calls, tokens, redirects)
 * lives unchanged in LoginFormContent/RegisterFormContent — this file
 * only owns layout, imagery and the transition.
 */
export default function AuthScreen({ mode: initialMode }: { mode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const { width } = useWindowSize();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isRegister = mode !== "login";
  const registerRole: "student" | "hotel" = mode === "register-hotel" ? "hotel" : "student";

  const switchToRegister = (role: "student" | "hotel") => setMode(role === "hotel" ? "register-hotel" : "register-student");
  const switchToLogin = () => setMode("login");

  if (isDesktop) {
    return (
      <AuthScreenDesktop
        isRegister={isRegister}
        registerRole={registerRole}
        onSwitchToRegister={switchToRegister}
        onSwitchToLogin={switchToLogin}
      />
    );
  }
  return (
    <AuthScreenMobile
      isRegister={isRegister}
      registerRole={registerRole}
      onSwitchToRegister={switchToRegister}
      onSwitchToLogin={switchToLogin}
    />
  );
}

// ---------------------------------------------------------------------------
// DESKTOP — diagonal split (CSS clip-path animates the slide; opacity
// cross-fades which content is on top of each side).
// ---------------------------------------------------------------------------
function HeroPanel({ visible, heading, subtitle, image, align }: any) {
  return (
    <div
      style={{
        ...styles.absoluteFill,
        ...styles.heroPanel,
        alignItems: align === "right" ? "flex-end" : "flex-start",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity 550ms ease ${visible ? "180ms" : "0ms"}`,
      }}
    >
      <img src={image} alt="" style={{ ...styles.absoluteFillObject, objectFit: "cover" }} />
      <div style={styles.heroScrim} />
      <div style={{ ...styles.heroContent, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
        <Logo size="md" />
        <h2 style={{ ...styles.heroHeading, textAlign: align === "right" ? "right" : "left" }}>{heading}</h2>
        <p style={{ ...styles.heroSubtitle, textAlign: align === "right" ? "right" : "left" }}>{subtitle}</p>
      </div>
    </div>
  );
}

function FormPanel({ visible, align, topOffset, children }: any) {
  // A single flex-column container, same shape as HeroPanel — a
  // separate 100%-wide scroll wrapper here would defeat alignItems
  // (a full-width child can't be "aligned" left/right within its
  // parent), which is exactly what put the register form's content
  // outside its own visible triangle. overflowY/paddingTop live
  // directly on this element instead.
  return (
    <div
      style={{
        ...styles.absoluteFill,
        ...styles.formPanel,
        alignItems: align === "right" ? "flex-end" : "flex-start",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity 550ms ease ${visible ? "180ms" : "0ms"}`,
        overflowY: "auto",
        paddingTop: topOffset,
      }}
    >
      {children}
    </div>
  );
}

function AuthScreenDesktop({ isRegister, registerRole, onSwitchToRegister, onSwitchToLogin }: any) {
  const { width, height } = useWindowSize();
  const { narrowX, wideX, formTopOffset } = diagonalGeometry(width, height);

  // Login: left region (the form) is narrow at the top, wide at the
  // bottom. Register mirrors it: left region (the hero) wide at the top,
  // narrow at the bottom. The right region is always the complement, so
  // it's built from the exact same two numbers.
  const leftTopX = isRegister ? wideX : narrowX;
  const leftBottomX = isRegister ? narrowX : wideX;

  const clipTransition: React.CSSProperties = {
    // This is what actually slides the diagonal seam across the
    // screen when Login/Register switch.
    transition: `clip-path ${SLIDE_MS}ms ${EASE}`,
  };

  return (
    <div style={styles.desktopRoot}>
      {/* LEFT: Register hero (visible when registering) OR Login form
          (visible when logging in). */}
      <div
        style={{
          ...styles.absoluteFill,
          ...clipTransition,
          clipPath: `polygon(0 0, ${leftTopX}px 0, ${leftBottomX}px 100%, 0 100%)`,
        }}
      >
        <div style={styles.panelInner}>
          <HeroPanel
            visible={isRegister}
            image={IMG_REGISTER_HERO}
            heading="Join the Mealvest table"
            subtitle="Create an account and start funding meals at hotels you already trust."
            align="left"
          />
          <FormPanel visible={!isRegister} align="left" topOffset={formTopOffset}>
            <LoginFormContent onSwitchToRegister={onSwitchToRegister} />
          </FormPanel>
        </div>
      </div>

      {/* RIGHT: Login hero (visible when logging in) OR Register form
          (visible when registering) — the complement of the left clip. */}
      <div
        style={{
          ...styles.absoluteFill,
          ...clipTransition,
          clipPath: `polygon(${leftTopX}px 0, 100% 0, 100% 100%, ${leftBottomX}px 100%)`,
        }}
      >
        <div style={styles.panelInner}>
          <HeroPanel
            visible={!isRegister}
            image={IMG_LOGIN_HERO}
            heading="Good food, brighter days"
            subtitle="Fund a meal plan with hotels you trust and eat well every single day."
            align="right"
          />
          <FormPanel visible={isRegister} align="right" topOffset={formTopOffset}>
            <RegisterFormContent mode={registerRole} onSwitchToLogin={onSwitchToLogin} />
          </FormPanel>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MOBILE — full-bleed hero background behind a centered form, matching the
// reference's own mobile treatment (no diagonal at that width). The
// background photo cross-fades between the login/register images via a
// plain CSS opacity transition on two stacked <img> elements.
// ---------------------------------------------------------------------------
function AuthScreenMobile({ isRegister, registerRole, onSwitchToRegister, onSwitchToLogin }: any) {
  return (
    <div style={styles.mobileRoot}>
      <img
        src={IMG_LOGIN_HERO}
        alt=""
        style={{ ...styles.absoluteFillObject, objectFit: "cover", opacity: isRegister ? 0 : 1, transition: "opacity 600ms ease" }}
      />
      <img
        src={IMG_REGISTER_HERO}
        alt=""
        style={{ ...styles.absoluteFillObject, objectFit: "cover", opacity: isRegister ? 1 : 0, transition: "opacity 600ms ease" }}
      />
      <div style={styles.mobileScrim} />

      <div style={styles.mobileScroll}>
        {isRegister ? (
          <RegisterFormContent mode={registerRole} onSwitchToLogin={onSwitchToLogin} />
        ) : (
          <LoginFormContent onSwitchToRegister={onSwitchToRegister} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
  desktopRoot: { flex: 1, width: "100%", height: "100%", position: "relative", backgroundColor: COLORS.bg, overflow: "hidden" },
  panelInner: { position: "relative", width: "100%", height: "100%" },
  heroPanel: { display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: 56, overflow: "hidden" },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(29,21,17,0.55)" },
  heroContent: { display: "flex", flexDirection: "column", marginTop: 40, maxWidth: 380, position: "relative" },
  heroHeading: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 32, lineHeight: "40px", color: "#fff", margin: 0, marginTop: 22 },
  heroSubtitle: { fontFamily: FONTS.body, fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 12, lineHeight: "21px" },
  formPanel: { display: "flex", flexDirection: "column", paddingLeft: FORM_PADDING, paddingRight: FORM_PADDING, paddingBottom: 40 },
  mobileRoot: { flex: 1, width: "100%", height: "100%", position: "relative", backgroundColor: COLORS.bg },
  mobileScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(29,21,17,0.72)" },
  mobileScroll: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
    overflowY: "auto",
  },
};
