import React, { useState, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../styles/theme";
import { Spinner } from "../components/Spinner";
import { SplashScreen } from "../pages/SplashScreen";
import { UnauthenticatedRoutes } from "./UnauthenticatedRoutes";
import { StudentRoutes } from "./StudentRoutes";
import { HotelStaffRoutes } from "./HotelStaffRoutes";
import { HotelOwnerRoutes } from "./HotelOwnerRoutes";
import { AdminRoutes } from "./AdminRoutes";
import { AnnouncementPopup } from "../components/AnnouncementPopup";
import InstallScreen from "../pages/InstallScreen";
import { PinGateScreen } from "../pages/PinGateScreen";

/**
 * /install is matched here, before anything else in the app — no
 * splash, no auth check, no role-based routing, and (since it's
 * matched ahead of the "*" branch below) never touched by
 * UnauthenticatedRoutes' own catch-all redirect to /login. It's a
 * standalone, public, direct-URL-only utility page: not linked from
 * any nav, not a default route, doesn't affect anything else here.
 */
export function RootGate() {
  return (
    <Routes>
      <Route path="/install" element={<InstallScreen />} />
      <Route path="*" element={<AuthGatedApp />} />
    </Routes>
  );
}

/**
 * Web port of navigation/RootNavigator.tsx's RootNavigator function —
 * same launch sequence, same logic, just returning route tables
 * instead of React Navigation stacks:
 *
 * Splash (logo, fixed minimum display time) -> once BOTH the splash
 * timer has elapsed AND AuthContext's silent-refresh check has
 * resolved, either the correct role's routes (already logged in) or
 * the unauthenticated routes.
 *
 * Splash and the auth check run in parallel rather than splash-then-
 * check, so a slow network doesn't add extra visible delay beyond
 * what the auth check needed anyway.
 */
function AuthGatedApp() {
  const { user, isLoading, pendingLogin } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashDone(true), []);

  if (!splashDone) {
    return <SplashScreen onFinished={handleSplashFinished} />;
  }

  // A password login just succeeded but the mandatory PIN second
  // factor hasn't been answered yet — `user` is still null at this
  // point, so this must be checked ahead of every other branch below,
  // same priority as splash/loading.
  if (pendingLogin) {
    return <PinGateScreen />;
  }

  if (isLoading) {
    // Splash's minimum time elapsed but the silent-refresh check is
    // still in flight (e.g. slow network) — brief spinner, not a
    // second splash.
    return (
      <div
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.bg,
        }}
      >
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  if (!user) {
    return <UnauthenticatedRoutes />;
  }

  switch (user.role) {
    case "student":
      return (
        <>
          <AnnouncementPopup />
          <StudentRoutes />
        </>
      );
    case "hotel_staff":
      return (
        <>
          <AnnouncementPopup />
          <HotelStaffRoutes />
        </>
      );
    case "hotel_owner":
      return (
        <>
          <AnnouncementPopup />
          <HotelOwnerRoutes />
        </>
      );
    case "mealvest_admin":
      return <AdminRoutes />;
    default:
      return <UnauthenticatedRoutes />;
  }
}
