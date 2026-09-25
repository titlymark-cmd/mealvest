import React, { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../styles/theme";
import { Spinner } from "../components/Spinner";
import { SplashScreen } from "../pages/SplashScreen";
import { UnauthenticatedRoutes } from "./UnauthenticatedRoutes";
import { StudentRoutes } from "./StudentRoutes";
import { HotelStaffRoutes } from "./HotelStaffRoutes";
import { HotelOwnerRoutes } from "./HotelOwnerRoutes";
import { AdminRoutes } from "./AdminRoutes";

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
export function RootGate() {
  const { user, isLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashDone(true), []);

  if (!splashDone) {
    return <SplashScreen onFinished={handleSplashFinished} />;
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
      return <StudentRoutes />;
    case "hotel_staff":
      return <HotelStaffRoutes />;
    case "hotel_owner":
      return <HotelOwnerRoutes />;
    case "mealvest_admin":
      return <AdminRoutes />;
    default:
      return <UnauthenticatedRoutes />;
  }
}
