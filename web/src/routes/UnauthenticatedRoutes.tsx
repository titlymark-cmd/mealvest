import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthScreen from "../pages/AuthScreen";
import LandingPage from "../pages/public/LandingPage";
import PublicHotelsPage from "../pages/public/PublicHotelsPage";
import PublicHotelDetailPage from "../pages/public/PublicHotelDetailPage";
import { ForgotPasswordScreen } from "../pages/ForgotPasswordScreen";
import { ResetPasswordScreen } from "../pages/ResetPasswordScreen";
import { VerifyEmailScreen } from "../pages/VerifyEmailScreen";

/**
 * Web port of RootNavigator's UnauthenticatedNavigator. /login,
 * /register/student and /register/hotel all render the SAME
 * AuthScreen component (differing only by the `mode` prop) — that's
 * what lets the Login<->Register toggle inside AuthScreen animate as
 * one persistent diagonal-split screen instead of a hard route swap.
 * Each path stays real and directly linkable, it just always lands on
 * the same underlying screen.
 *
 * "/" is the public landing page, with /hotels and /hotels/:id for
 * browsing. Anything else that is not a known public route (including
 * every protected path) still goes to /login, as before.
 */
export function UnauthenticatedRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthScreen mode="login" />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/hotels" element={<PublicHotelsPage />} />
      <Route path="/hotels/:hotelId" element={<PublicHotelDetailPage />} />
      <Route path="/welcome" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/verify-email" element={<VerifyEmailScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/register/student" element={<AuthScreen mode="register-student" />} />
      <Route path="/register/hotel" element={<AuthScreen mode="register-hotel" />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
