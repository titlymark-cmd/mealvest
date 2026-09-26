import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar, ADMIN_MOBILE_BREAKPOINT, ADMIN_SIDEBAR_WIDTH } from "../components/admin/AdminSidebar";
import { useWindowSize } from "../hooks/useWindowSize";
import AdminOverviewScreen from "../pages/admin/AdminOverviewScreen";
import AdminHotelsScreen from "../pages/admin/AdminHotelsScreen";
import AdminOrdersScreen from "../pages/admin/AdminOrdersScreen";
import AdminPaymentsScreen from "../pages/admin/AdminPaymentsScreen";
import AdminCreateHotelScreen from "../pages/admin/AdminCreateHotelScreen";

/**
 * The sidebar (desktop) / tab bar (mobile) is always position:fixed —
 * out of normal document flow — so it never scrolls with the page.
 * This shell is the ONE scroll container for admin content: it's
 * capped at exactly the viewport height with overflow:hidden, and the
 * content pane inside it is the only element with its own
 * overflowY:auto, offset past the fixed sidebar with marginLeft so
 * nothing overlaps. That keeps #root (the app-wide scroll container
 * every other screen relies on — see styles/reset.css) from ever
 * needing to scroll here, which is what let the whole shell — sidebar
 * included — drift together before.
 */
function AdminShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowSize();
  const isMobile = width < ADMIN_MOBILE_BREAKPOINT;
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <AdminSidebar />
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          marginLeft: isMobile ? 0 : ADMIN_SIDEBAR_WIDTH,
          // Bottom padding on mobile keeps content clear of the fixed floating tab bar.
          paddingBottom: isMobile ? 96 : 0,
        }}
      >
        {children}
      </div>
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
