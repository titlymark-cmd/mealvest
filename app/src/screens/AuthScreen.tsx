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

// The diagonal lean is a fixed pixel amount cut from the hero image's own
// inner corner (the edge facing the form column) — NOT a percentage of the
// whole screen. Applying it only to the hero image, confined to its own
// half of a plain 50/50 flex row, means the form column next to it is a
// normal unclipped rectangle and can never have its text or inputs sliced
// off by the seam, regardless of viewport width or how tall the form is.
const HERO_LEAN_PX = 110;

function heroLeanClip(edge: "left" | "right"): string {
  if (edge === "left") return `polygon(${HERO_LEAN_PX}px 0, 100% 0, 100% 100%, 0 100%)`;
  return `polygon(0 0, calc(100% - ${HERO_LEAN_PX}px) 0, 100% 100%, 0 100%)`;
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
function HeroPanel({ visible, heading, subtitle, image, align, leanEdge }: any) {
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
      {/* The diagonal lean lives on this inner wrapper only, sized to this
          hero's own half of the screen — it never reaches the form column,
          so form content can never be clipped by it. */}
      <View style={[StyleSheet.absoluteFill, { clipPath: heroLeanClip(leanEdge) } as any]}>
        <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={styles.heroScrim} />
      </View>
      <View style={[styles.heroContent, { alignItems: align === "right" ? "flex-end" : "flex-start" }]}>
        <Logo size="md" />
        <Text style={[styles.heroHeading, { textAlign: align === "right" ? "right" : "left" }]}>{heading}</Text>
        <Text style={[styles.heroSubtitle, { textAlign: align === "right" ? "right" : "left" }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FormPanel({ visible, children }: any) {
  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        styles.formPanel,
        {
          opacity: visible ? 1 : 0,
          // @ts-ignore -- web-only CSS transition
          transition: `opacity 550ms ease ${visible ? "180ms" : "0ms"}`,
        },
      ]}
    >
      <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

function AuthScreenDesktop({ isRegister, registerRole, onSwitchToRegister, onSwitchToLogin }: any) {
  return (
    <View style={styles.desktopRoot}>
      {/* LEFT column: Register hero (visible when registering) OR Login form
          (visible when logging in) — a plain flex:1 half, so whichever of
          the two is on top can never be clipped. Only the hero's own image
          gets the diagonal lean, on its right (inner) edge. */}
      <View style={styles.desktopColumn}>
        <HeroPanel
          visible={isRegister}
          image={IMG_REGISTER_HERO}
          heading="Join the Mealvest table"
          subtitle="Create an account and start funding meals at hotels you already trust."
          align="left"
          leanEdge="right"
        />
        <FormPanel visible={!isRegister}>
          <LoginFormContent onSwitchToRegister={onSwitchToRegister} />
        </FormPanel>
      </View>

      {/* RIGHT column: Login hero (visible when logging in) OR Register form
          (visible when registering). The hero leans its left (inner) edge. */}
      <View style={styles.desktopColumn}>
        <HeroPanel
          visible={!isRegister}
          image={IMG_LOGIN_HERO}
          heading="Good food, brighter days"
          subtitle="Fund a meal plan with hotels you trust and eat well every single day."
          align="right"
          leanEdge="left"
        />
        <FormPanel visible={isRegister}>
          <RegisterFormContent mode={registerRole} onSwitchToLogin={onSwitchToLogin} />
        </FormPanel>
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
  desktopRoot: { flex: 1, flexDirection: "row", backgroundColor: COLORS.bg, overflow: "hidden" },
  desktopColumn: { flex: 1, position: "relative", overflow: "hidden" },
  heroPanel: { justifyContent: "flex-start", padding: 56, overflow: "hidden" },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(29,21,17,0.55)" },
  heroContent: { marginTop: 40, maxWidth: 380 },
  heroHeading: { fontFamily: FONTS.displayBold, fontSize: 32, lineHeight: 40, color: "#fff", marginTop: 22 },
  heroSubtitle: { fontFamily: FONTS.body, fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 12, lineHeight: 21 },
  formPanel: { alignItems: "center", justifyContent: "center", padding: 56 },
  formScroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 40 },

  mobileRoot: { flex: 1, backgroundColor: COLORS.bg },
  mobileScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(29,21,17,0.72)" },
  mobileScroll: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 60, paddingBottom: 40 },
});
