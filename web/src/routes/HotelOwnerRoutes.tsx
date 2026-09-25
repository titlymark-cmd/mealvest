import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HotelOwnerHomeScreen from "../pages/hotelOwner/HotelOwnerHomeScreen";
import HotelScannerScreen from "../pages/hotel/HotelScannerScreen";
import HotelOrdersScreen from "../pages/hotel/HotelOrdersScreen";
import HotelMenuManageScreen from "../pages/hotelOwner/HotelMenuManageScreen";
import HotelProfileScreen from "../pages/hotelOwner/HotelProfileScreen";

/** Web port of navigation/HotelOwnerStack.tsx. */
export function HotelOwnerRoutes() {
  return (
    <Routes>
      <Route path="/hotel-owner/home" element={<HotelOwnerHomeScreen />} />
      <Route path="/hotel-owner/scanner" element={<HotelScannerScreen />} />
      <Route path="/hotel-owner/orders" element={<HotelOrdersScreen />} />
      <Route path="/hotel-owner/menu" element={<HotelMenuManageScreen />} />
      <Route path="/hotel-owner/profile" element={<HotelProfileScreen />} />
      <Route path="*" element={<Navigate to="/hotel-owner/home" replace />} />
    </Routes>
  );
}
