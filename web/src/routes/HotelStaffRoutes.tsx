import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PlaceholderScreen } from "../components/PlaceholderScreen";

/** Stub for Phase 3 — real hotel-staff screens land here. */
export function HotelStaffRoutes() {
  return (
    <Routes>
      <Route path="/hotel-staff/*" element={<PlaceholderScreen label="Hotel Staff" note="Migrating in Phase 3." />} />
      <Route path="*" element={<Navigate to="/hotel-staff/home" replace />} />
    </Routes>
  );
}
