import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HotelListScreen from "../pages/student/HotelListScreen";
import HotelMenuScreen from "../pages/student/HotelMenuScreen";
import BudgetOnboardingScreen from "../pages/student/BudgetOnboardingScreen";
import StudentHomeScreen from "../pages/student/StudentHomeScreen";
import MealPassScreen from "../pages/student/MealPassScreen";
import OrderHistoryScreen from "../pages/student/OrderHistoryScreen";
import MealBoostScreen from "../pages/student/MealBoostScreen";

/**
 * Web port of navigation/StudentStack.tsx. Same seven screens, same
 * entry point (HotelList was the original stack's first/default
 * screen, so it's the index route here too — a freshly registered
 * student lands on hotel browsing, not the dashboard).
 *
 * Cross-screen data (hotelId, hotelName, selected item, etc.) that
 * the original passed via React Navigation's route.params is passed
 * the same way here, via React Router's navigate(path, { state }) /
 * useLocation().state — both are in-memory only and don't survive a
 * hard refresh, matching route.params' own behavior exactly (RN
 * route params don't survive a cold app relaunch either).
 *
 * /student/hotels/map (HotelMapScreen) is intentionally NOT routed —
 * it's dead code in the original app too (imports react-native-maps
 * but was never registered in StudentStack), carried over unwired
 * rather than built out into new functionality.
 */
export function StudentRoutes() {
  return (
    <Routes>
      <Route path="/student" element={<HotelListScreen />} />
      <Route path="/student/hotels/:hotelId/menu" element={<HotelMenuScreen />} />
      <Route path="/student/budget-onboarding" element={<BudgetOnboardingScreen />} />
      <Route path="/student/home" element={<StudentHomeScreen />} />
      <Route path="/student/meal-pass" element={<MealPassScreen />} />
      <Route path="/student/orders" element={<OrderHistoryScreen />} />
      <Route path="/student/meal-boost" element={<MealBoostScreen />} />
      <Route path="*" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}
