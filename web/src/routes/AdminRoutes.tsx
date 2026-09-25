import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminHomeScreen from "../pages/admin/AdminHomeScreen";
import AdminCreateHotelScreen from "../pages/admin/AdminCreateHotelScreen";

/** Web port of navigation/AdminStack.tsx. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/home" element={<AdminHomeScreen />} />
      <Route path="/admin/create-hotel" element={<AdminCreateHotelScreen />} />
      <Route path="*" element={<Navigate to="/admin/home" replace />} />
    </Routes>
  );
}
