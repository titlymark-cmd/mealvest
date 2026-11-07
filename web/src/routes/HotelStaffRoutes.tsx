import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { StaffNav, STAFF_MOBILE_BREAKPOINT, STAFF_SIDEBAR_WIDTH } from "../components/hotel/StaffNav";
import { NotificationBell } from "../components/notifications/NotificationBell";
import { VerificationBanner } from "../components/account/VerificationBanner";
import { useWindowSize } from "../hooks/useWindowSize";
import HotelStaffHomeScreen from "../pages/hotelStaff/HotelStaffHomeScreen";
import HotelStaffSettingsScreen from "../pages/hotelStaff/HotelStaffSettingsScreen";
import HotelScannerScreen from "../pages/hotel/HotelScannerScreen";
import HotelOrdersScreen from "../pages/hotel/HotelOrdersScreen";
import { VerifyEmailScreen } from "../pages/VerifyEmailScreen";

/**
 * The staff application shell — same pattern as the owner's (see HotelOwnerRoutes): navigation,
 * the notification bell, and a single scroll container. Staff keep their minimal operational
 * experience (home, orders, scan) and gain settings (verification, notifications, PIN, logout).
 * The scanner stays full-screen like the owner's, without the shell.
 */
function HotelStaffShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowSize();
  const isMobile = width < STAFF_MOBILE_BREAKPOINT;
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <StaffNav />
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 60 }}>
        <NotificationBell />
      </div>
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          marginLeft: isMobile ? 0 : STAFF_SIDEBAR_WIDTH,
          paddingBottom: isMobile ? 96 : 0,
        }}
      >
        <VerificationBanner skin="hotel" to="/hotel-staff/settings" />
        {children}
      </div>
    </div>
  );
}

/** Web port of navigation/HotelStaffStack.tsx, now with a proper shell and a settings screen. */
export function HotelStaffRoutes() {
  return (
    <Routes>
      <Route path="/hotel-staff/home" element={<HotelStaffShell><HotelStaffHomeScreen /></HotelStaffShell>} />
      <Route path="/hotel-staff/scanner" element={<HotelScannerScreen />} />
      <Route path="/hotel-staff/orders" element={<HotelStaffShell><HotelOrdersScreen /></HotelStaffShell>} />
      <Route path="/hotel-staff/settings" element={<HotelStaffShell><HotelStaffSettingsScreen /></HotelStaffShell>} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="*" element={<Navigate to="/hotel-staff/home" replace />} />
    </Routes>
  );
}
