import React from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../styles/theme";
import { Spinner } from "../components/Spinner";
import { UnauthenticatedRoutes } from "./UnauthenticatedRoutes";
import { StudentRoutes } from "./StudentRoutes";
import { HotelStaffRoutes } from "./HotelStaffRoutes";
import { HotelOwnerRoutes } from "./HotelOwnerRoutes";
import { AdminRoutes } from "./AdminRoutes";
import { AnnouncementPopup } from "../components/AnnouncementPopup";
import InstallScreen from "../pages/InstallScreen";
import DemoScreen from "../pages/demo/DemoScreen";
import { PinGateScreen } from "../pages/PinGateScreen";
import { PinUnlockScreen } from "../pages/PinUnlockScreen";
import TermsScreen from "../pages/TermsScreen";

/**
 * /install is matched here, before anything else in the app — no
 * auth check, no role-based routing, and (since it's
 * matched ahead of the "*" branch below) never touched by
 * UnauthenticatedRoutes' own catch-all redirect to /login. It's a
 * standalone, public, direct-URL-only utility page: not linked from
 * any nav, not a default route, doesn't affect anything else here.
 */
export function RootGate() {
  return (
    <Routes>
      <Route path="/install" element={<InstallScreen />} />
      <Route path="/demo" element={<DemoScreen />} />
      {/* Public, same as /install: readable before registering, from the
          plan disclaimer, and from the withdrawal screen while signed in. */}
      <Route path="/terms" element={<TermsScreen />} />
      <Route path="*" element={<AuthGatedApp />} />
    </Routes>
  );
}

/**
 * Web port of navigation/RootNavigator.tsx's RootNavigator function —
 * same launch sequence, same logic, just returning route tables
 * instead of React Navigation stacks:
 *
 * Once AuthContext's silent-refresh check has resolved, either the
 * correct role's routes (already logged in) or the unauthenticated
 * routes. The former splash screen (logo + tagline with a minimum
 * display time) was removed; nothing waits on it any more.
 */
function AuthGatedApp() {
  const { user, isLoading, pendingLogin, isLocked } = useAuth();

  // No splash screen: the app goes straight to the silent-refresh
  // check and then to the right route table. A password login just
  // succeeded but the mandatory PIN second factor hasn't been answered
  // yet — `user` is still null at this point, so this must be checked
  // ahead of every other branch below.
  if (pendingLogin) {
    return <PinGateScreen />;
  }

  if (isLoading) {
    // Silent-refresh check still in flight (e.g. slow network) — a
    // brief spinner on the canvas.
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

  // A valid session exists but the app is locked (reopened PWA / long
  // background). This is NOT logged-out: it must be checked before the
  // `!user` branch below, otherwise a locked user would be shown the public
  // site and look signed out. The PIN screen is the only thing rendered, so
  // no protected route can mount until the server has verified the PIN.
  if (isLocked) {
    return <PinUnlockScreen />;
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
