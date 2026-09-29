import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import HotelListScreen from "../pages/student/HotelListScreen";
import HotelMenuScreen from "../pages/student/HotelMenuScreen";
import BudgetOnboardingScreen from "../pages/student/BudgetOnboardingScreen";
import StudentHomeScreen from "../pages/student/StudentHomeScreen";
import StudentMenuScreen from "../pages/student/StudentMenuScreen";
import MealPassScreen from "../pages/student/MealPassScreen";
import OrderHistoryScreen from "../pages/student/OrderHistoryScreen";
import MealBoostScreen from "../pages/student/MealBoostScreen";
import PaymentCallbackScreen from "../pages/student/PaymentCallbackScreen";
import StudentProfileScreen from "../pages/student/StudentProfileScreen";
import { StudentSidebar, STUDENT_MOBILE_BREAKPOINT, STUDENT_SIDEBAR_WIDTH } from "../components/student/StudentSidebar";
import { useWindowSize } from "../hooks/useWindowSize";
import { useAuth } from "../context/AuthContext";
import { getActiveBudget } from "../services/budgetApi";
import { COLORS } from "../styles/theme";
import { Spinner } from "../components/Spinner";

/**
 * Persistent sidebar shell for the three screens a student with an
 * active plan actually lives in day to day — same pattern as
 * AdminShell/HotelOwnerShell (see those files for the rationale).
 * Everything else here (hotel browsing, budget onboarding, the
 * meal-pass QR screen, order history, meal boost) is a focused,
 * single-purpose flow and deliberately stays OUTSIDE this shell, the
 * same way hotel-owner's own scanner screen does.
 */
function StudentDashboardShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowSize();
  const isMobile = width < STUDENT_MOBILE_BREAKPOINT;
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <StudentSidebar />
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          marginLeft: isMobile ? 0 : STUDENT_SIDEBAR_WIDTH,
          paddingBottom: isMobile ? 96 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The index route used to always be HotelListScreen, even for a
 * returning student who already has an active plan — /student/home
 * (the dashboard) was only ever reached via an explicit navigate()
 * right after finishing onboarding, in the same session. That meant a
 * funded student reopening the app always landed back on hotel
 * browsing instead of their dashboard. This gate fixes that: check
 * once for an active plan, and only fall through to hotel browsing
 * when there genuinely isn't one yet.
 */
function StudentIndexGate() {
  const { authFetch } = useAuth();
  const [hasActiveBudget, setHasActiveBudget] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveBudget(authFetch)
      .then((b) => {
        if (!cancelled) setHasActiveBudget(Boolean(b));
      })
      .catch(() => {
        if (!cancelled) setHasActiveBudget(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  if (hasActiveBudget === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg }}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  return hasActiveBudget ? <Navigate to="/student/home" replace /> : <HotelListScreen />;
}

export function StudentRoutes() {
  return (
    <Routes>
      <Route path="/student" element={<StudentIndexGate />} />
      <Route path="/student/hotels/:hotelId/menu" element={<HotelMenuScreen />} />
      <Route path="/student/budget-onboarding" element={<BudgetOnboardingScreen />} />
      <Route path="/student/home" element={<StudentDashboardShell><StudentHomeScreen /></StudentDashboardShell>} />
      <Route path="/student/menu" element={<StudentDashboardShell><StudentMenuScreen /></StudentDashboardShell>} />
      <Route path="/student/profile" element={<StudentDashboardShell><StudentProfileScreen /></StudentDashboardShell>} />
      <Route path="/student/meal-pass" element={<MealPassScreen />} />
      <Route path="/student/orders" element={<OrderHistoryScreen />} />
      <Route path="/student/meal-boost" element={<MealBoostScreen />} />
      <Route path="/payment/callback" element={<PaymentCallbackScreen />} />
      <Route path="*" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}
