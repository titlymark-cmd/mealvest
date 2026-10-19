import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import WithdrawSavingsScreen from "../pages/student/WithdrawSavingsScreen";
import StudentPaymentsScreen from "../pages/student/StudentPaymentsScreen";
import { StudentTopBar, StudentBottomNav } from "../components/student/StudentNav";
import { ComingSoonBadge } from "../components/ComingSoonBadge";
import { useAuth } from "../context/AuthContext";
import { getActiveBudget } from "../services/budgetApi";
import { COLORS } from "../styles/theme";
import { Spinner } from "../components/Spinner";
import { VerifyEmailScreen } from "../pages/VerifyEmailScreen";

/**
 * Persistent student shell: sticky top bar (desktop nav + bell + account),
 * floating pill nav on phones, and ONE scroll container for page content.
 * The shell is keyed on the pathname so each destination fades in, but the
 * nav chrome itself never remounts — that is what lets the pill's active
 * thumb slide between destinations instead of popping.
 *
 * Focused single-purpose flows (hotel browsing, plan setup, the QR
 * meal-pass, meal boost, savings withdrawal, payment callback) stay OUTSIDE
 * the shell on purpose: nothing may cover a QR code or a payment action.
 */
function StudentDashboardShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div id="mv-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        <StudentTopBar />
        <ComingSoonBadge />
        <main key={pathname} className="mv-page mv-has-bottomnav mv-shell-main">
          {children}
        </main>
      </div>
      <StudentBottomNav />
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
      <Route path="/student/orders" element={<StudentDashboardShell><OrderHistoryScreen /></StudentDashboardShell>} />
      <Route path="/student/meal-boost" element={<MealBoostScreen />} />
      <Route path="/student/withdraw" element={<WithdrawSavingsScreen />} />
      <Route path="/student/payments" element={<StudentDashboardShell><StudentPaymentsScreen /></StudentDashboardShell>} />
      <Route path="/payment/callback" element={<PaymentCallbackScreen />} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="*" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}
