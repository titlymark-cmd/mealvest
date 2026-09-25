import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PlaceholderScreen } from "../components/PlaceholderScreen";

/**
 * Stub for Phase 2 — real student screens (HotelList, HotelMenu,
 * BudgetOnboarding, StudentHome, MealPass, OrderHistory, MealBoost)
 * land here. Kept as its own route table now so RootGate can already
 * route a logged-in student somewhere real while Phase 1 (auth) is
 * being verified end-to-end.
 */
export function StudentRoutes() {
  return (
    <Routes>
      <Route path="/student/*" element={<PlaceholderScreen label="Student" note="Migrating in Phase 2." />} />
      <Route path="*" element={<Navigate to="/student/home" replace />} />
    </Routes>
  );
}
