import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PlaceholderScreen } from "../components/PlaceholderScreen";

/** Stub for Phase 4 — real admin screens land here. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/*" element={<PlaceholderScreen label="Admin" note="Migrating in Phase 4." />} />
      <Route path="*" element={<Navigate to="/admin/home" replace />} />
    </Routes>
  );
}
