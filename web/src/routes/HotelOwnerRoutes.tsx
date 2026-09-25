import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PlaceholderScreen } from "../components/PlaceholderScreen";

/** Stub for Phase 3 — real hotel-owner screens land here. */
export function HotelOwnerRoutes() {
  return (
    <Routes>
      <Route path="/hotel-owner/*" element={<PlaceholderScreen label="Hotel Owner" note="Migrating in Phase 3." />} />
      <Route path="*" element={<Navigate to="/hotel-owner/home" replace />} />
    </Routes>
  );
}
