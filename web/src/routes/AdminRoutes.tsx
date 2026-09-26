import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar } from "../components/admin/AdminSidebar";
import AdminOverviewScreen from "../pages/admin/AdminOverviewScreen";
import AdminHotelsScreen from "../pages/admin/AdminHotelsScreen";
import AdminOrdersScreen from "../pages/admin/AdminOrdersScreen";
import AdminPaymentsScreen from "../pages/admin/AdminPaymentsScreen";
import AdminCreateHotelScreen from "../pages/admin/AdminCreateHotelScreen";

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", width: "100%", minHeight: "100%" }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Web port of navigation/AdminStack.tsx, now split across a persistent sidebar shell. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/home" element={<AdminShell><AdminOverviewScreen /></AdminShell>} />
      <Route path="/admin/hotels" element={<AdminShell><AdminHotelsScreen /></AdminShell>} />
      <Route path="/admin/orders" element={<AdminShell><AdminOrdersScreen /></AdminShell>} />
      <Route path="/admin/payments" element={<AdminShell><AdminPaymentsScreen /></AdminShell>} />
      <Route path="/admin/create-hotel" element={<AdminCreateHotelScreen />} />
      <Route path="*" element={<Navigate to="/admin/home" replace />} />
    </Routes>
  );
}
