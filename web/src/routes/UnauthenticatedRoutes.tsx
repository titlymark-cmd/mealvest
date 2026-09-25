import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthScreen from "../pages/AuthScreen";
import WelcomeScreen from "../pages/WelcomeScreen";

/**
 * Web port of RootNavigator's UnauthenticatedNavigator. /login,
 * /register/student and /register/hotel all render the SAME
 * AuthScreen component (differing only by the `mode` prop) — that's
 * what lets the Login<->Register toggle inside AuthScreen animate as
 * one persistent diagonal-split screen instead of a hard route swap.
 * Each path stays real and directly linkable (WelcomeScreen still
 * navigates to them by path), it just always lands on the same
 * underlying screen.
 */
export function UnauthenticatedRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthScreen mode="login" />} />
      <Route path="/welcome" element={<WelcomeScreen />} />
      <Route path="/register/student" element={<AuthScreen mode="register-student" />} />
      <Route path="/register/hotel" element={<AuthScreen mode="register-hotel" />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
