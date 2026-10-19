import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HotelStaffHomeScreen from "../pages/hotelStaff/HotelStaffHomeScreen";
import HotelScannerScreen from "../pages/hotel/HotelScannerScreen";
import HotelOrdersScreen from "../pages/hotel/HotelOrdersScreen";
import { VerifyEmailScreen } from "../pages/VerifyEmailScreen";

/** Web port of navigation/HotelStaffStack.tsx. */
export function HotelStaffRoutes() {
  return (
    <Routes>
      <Route path="/hotel-staff/home" element={<HotelStaffHomeScreen />} />
      <Route path="/hotel-staff/scanner" element={<HotelScannerScreen />} />
      <Route path="/hotel-staff/orders" element={<HotelOrdersScreen />} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="*" element={<Navigate to="/hotel-staff/home" replace />} />
    </Routes>
  );
}
