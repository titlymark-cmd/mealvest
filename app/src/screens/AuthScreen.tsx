import React, { useState, useRef, useEffect } from "react";
import { View, Text, Image, StyleSheet, Platform, useWindowDimensions, Animated, ScrollView } from "react-native";
import { Logo } from "../components/Logo";
import { COLORS, FONTS } from "../theme/theme";
import { LoginFormContent } from "./LoginFormContent";
import { RegisterFormContent } from "./RegisterFormContent";

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
 * own trapezoid. This is what keeps the previous clipping bug from coming
 * back — instead of centering form content and hoping it lands clear of
 * the seam, it's placed at the one vertical position that's proven clear,
 * at any window size and for a form of any length (a long hotel
 * registration form just scrolls further before it's fully visible).
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
 * The Login/Register experience — one persistently-mounted screen
 * (not two separate routes swapped by the navigator) so the
 * diagonal-split transition between them can actually animate, the
 * way the UI/UX reference does it. "Login", "RegisterStudent" and
 * "RegisterHotel" still exist as real routes other screens navigate
 * to (see RootNavigator) — they all render this same component with
 * a different initial mode; switching between Login and Register
 * from WITHIN this screen changes local state instead of navigating,
 * which is what makes the animation possible.
 *
 * All actual auth logic (validation, API calls, tokens, redirects)
 * lives unchanged in LoginFormContent/RegisterFormContent — this file
 * only owns layout, imagery and the transition.
 */
export default function AuthScreen({ route }: any) {
  const initialMode: Mode = route?.params?.mode ?? "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
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
// DESKTOP — diagonal split, web only (CSS clip-path animates the lean; a
// React Native Animated value cross-fades which content is on top).
// ---------------------------------------------------------------------------
function HeroPanel({ visible, heading, subtitle, image, align }: any) {
  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        styles.heroPanel,
        {
          alignItems: align === "right" ? "flex-end" : "flex-start",
          opacity: visible ? 1 : 0,
          // @ts-ignore -- web-only CSS transition, RNW passes it through
          transition: `opacity 550ms ease ${visible ? "180ms" : "0ms"}`,
        },
      ]}
    >
      <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      <View style={styles.heroScrim} />
      <View style={[styles.heroContent, { alignItems: align === "right" ? "flex-end" : "flex-start" }]}>
        <Logo size="md" />
        <Text style={[styles.heroHeading, { textAlign: align === "right" ? "right" : "left" }]}>{heading}</Text>
        <Text style={[styles.heroSubtitle, { textAlign: align === "right" ? "right" : "left" }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FormPanel({ visible, align, topOffset, children }: any) {
  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        styles.formPanel,
        {
          alignItems: align === "right" ? "flex-end" : "flex-start",
          opacity: visible ? 1 : 0,
          // @ts-ignore -- web-only CSS transition
          transition: `opacity 550ms ease ${visible ? "180ms" : "0ms"}`,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[styles.formScroll, { paddingTop: topOffset }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function AuthScreenDesktop({ isRegister, registerRole, onSwitchToRegister, onSwitchToLogin }: any) {
  const { width, height } = useWindowDimensions();
  const { narrowX, wideX, formTopOffset } = diagonalGeometry(width, height);

  // Login: left region (the form) is narrow at the top, wide at the
  // bottom. Register mirrors it: left region (the hero) wide at the top,
  // narrow at the bottom. The right region is always the complement, so
  // it's built from the exact same two numbers.
  const leftTopX = isRegister ? wideX : narrowX;
  const leftBottomX = isRegister ? narrowX : wideX;

  const clipTransition = {
    // @ts-ignore -- web-only CSS transition; this is what actually slides
    // the diagonal seam across the screen when Login/Register switch.
    transition: `clip-path ${SLIDE_MS}ms ${EASE}`,
  };

  return (
    <View style={styles.desktopRoot}>
      {/* LEFT: Register hero (visible when registering) OR Login form
          (visible when logging in). */}
      <View
        style={[
          StyleSheet.absoluteFill,
          clipTransition,
          { clipPath: `polygon(0 0, ${leftTopX}px 0, ${leftBottomX}px 100%, 0 100%)` } as any,
        ]}
      >
        <View style={styles.panelInner}>
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
        </View>
      </View>

      {/* RIGHT: Login hero (visible when logging in) OR Register form
          (visible when registering) — the complement of the left clip. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          clipTransition,
          { clipPath: `polygon(${leftTopX}px 0, 100% 0, 100% 100%, ${leftBottomX}px 100%)` } as any,
        ]}
      >
        <View style={styles.panelInner}>
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
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// MOBILE — full-bleed hero background behind a centered form, matching the
// reference's own mobile treatment (no diagonal at that width). The
// background photo cross-fades between the login/register images using
// React Native's Animated API, which works identically on native and web.
// ---------------------------------------------------------------------------
function AuthScreenMobile({ isRegister, registerRole, onSwitchToRegister, onSwitchToLogin }: any) {
  const fade = useRef(new Animated.Value(isRegister ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: isRegister ? 1 : 0, duration: 600, useNativeDriver: true }).start();
  }, [isRegister, fade]);

  return (
    <View style={styles.mobileRoot}>
      <Animated.Image
        source={{ uri: IMG_LOGIN_HERO }}
        style={[StyleSheet.absoluteFillObject, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
        resizeMode="cover"
      />
      <Animated.Image
        source={{ uri: IMG_REGISTER_HERO }}
        style={[StyleSheet.absoluteFillObject, { opacity: fade }]}
        resizeMode="cover"
      />
      <View style={styles.mobileScrim} />

      <ScrollView contentContainerStyle={styles.mobileScroll} showsVerticalScrollIndicator={false}>
        {isRegister ? (
          <RegisterFormContent mode={registerRole} onSwitchToLogin={onSwitchToLogin} />
        ) : (
          <LoginFormContent onSwitchToRegister={onSwitchToRegister} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRoot: { flex: 1, backgroundColor: COLORS.bg, overflow: "hidden" },
  panelInner: { flex: 1 },
  heroPanel: { justifyContent: "flex-start", padding: 56, overflow: "hidden" },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(29,21,17,0.55)" },
  heroContent: { marginTop: 40, maxWidth: 380 },
  heroHeading: { fontFamily: FONTS.displayBold, fontSize: 32, lineHeight: 40, color: "#fff", marginTop: 22 },
  heroSubtitle: { fontFamily: FONTS.body, fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 12, lineHeight: 21 },
  formPanel: { paddingHorizontal: FORM_PADDING, paddingBottom: 40 },
  formScroll: { flexGrow: 1 },

  mobileRoot: { flex: 1, backgroundColor: COLORS.bg },
  mobileScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(29,21,17,0.72)" },
  mobileScroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 60, paddingBottom: 40 },
});
