import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { HotelSidebar, HOTEL_MOBILE_BREAKPOINT, HOTEL_SIDEBAR_WIDTH } from "../components/hotel/HotelSidebar";
import { useWindowSize } from "../hooks/useWindowSize";
import HotelScannerScreen from "../pages/hotel/HotelScannerScreen";
import HotelOwnerOverviewScreen from "../pages/hotelOwner/HotelOwnerOverviewScreen";
import HotelOwnerOrdersScreen from "../pages/hotelOwner/HotelOwnerOrdersScreen";
import HotelMenuManageScreen from "../pages/hotelOwner/HotelMenuManageScreen";
import HotelStudentsScreen from "../pages/hotelOwner/HotelStudentsScreen";
import HotelProfileScreen from "../pages/hotelOwner/HotelProfileScreen";

/** Same shell pattern as AdminRoutes.tsx's AdminShell — see that file for the rationale. */
function HotelOwnerShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowSize();
  const isMobile = width < HOTEL_MOBILE_BREAKPOINT;
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <HotelSidebar />
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          marginLeft: isMobile ? 0 : HOTEL_SIDEBAR_WIDTH,
          paddingBottom: isMobile ? 96 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Web port of navigation/HotelOwnerStack.tsx, now split across a persistent sidebar shell. */
export function HotelOwnerRoutes() {
  return (
    <Routes>
      <Route path="/hotel-owner/home" element={<HotelOwnerShell><HotelOwnerOverviewScreen /></HotelOwnerShell>} />
      <Route path="/hotel-owner/scanner" element={<HotelScannerScreen />} />
      <Route path="/hotel-owner/orders" element={<HotelOwnerShell><HotelOwnerOrdersScreen /></HotelOwnerShell>} />
      <Route path="/hotel-owner/menu" element={<HotelOwnerShell><HotelMenuManageScreen /></HotelOwnerShell>} />
      <Route path="/hotel-owner/students" element={<HotelOwnerShell><HotelStudentsScreen /></HotelOwnerShell>} />
      <Route path="/hotel-owner/profile" element={<HotelOwnerShell><HotelProfileScreen /></HotelOwnerShell>} />
      <Route path="*" element={<Navigate to="/hotel-owner/home" replace />} />
    </Routes>
  );
}
