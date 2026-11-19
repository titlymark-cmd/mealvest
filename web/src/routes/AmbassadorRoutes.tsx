import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AmbassadorShell } from "../components/ambassador/AmbassadorShell";
import AmbassadorOverviewScreen from "../pages/ambassador/AmbassadorOverviewScreen";
import AmbassadorAnalyticsScreen from "../pages/ambassador/AmbassadorAnalyticsScreen";
import AmbassadorAcquisitionScreen from "../pages/ambassador/AmbassadorAcquisitionScreen";
import AmbassadorMarketingScreen from "../pages/ambassador/AmbassadorMarketingScreen";
import AmbassadorHotelsScreen from "../pages/ambassador/AmbassadorHotelsScreen";
import AmbassadorHotelPerformanceScreen from "../pages/ambassador/AmbassadorHotelPerformanceScreen";
import AmbassadorCustomerCareScreen from "../pages/ambassador/AmbassadorCustomerCareScreen";
import AmbassadorTeamScreen from "../pages/ambassador/AmbassadorTeamScreen";
import AmbassadorCampaignsScreen from "../pages/ambassador/AmbassadorCampaignsScreen";
import AmbassadorTasksScreen from "../pages/ambassador/AmbassadorTasksScreen";
import AmbassadorReportsScreen from "../pages/ambassador/AmbassadorReportsScreen";
import AmbassadorAnnouncementsScreen from "../pages/ambassador/AmbassadorAnnouncementsScreen";
import AmbassadorSettingsScreen from "../pages/ambassador/AmbassadorSettingsScreen";

export function AmbassadorRoutes() {
  const shell = (screen: React.ReactElement) => <AmbassadorShell>{screen}</AmbassadorShell>;

  return (
    <Routes>
      <Route path="/ambassador" element={<Navigate to="/ambassador/overview" replace />} />
      <Route path="/ambassador/overview" element={shell(<AmbassadorOverviewScreen />)} />
      <Route path="/ambassador/analytics" element={shell(<AmbassadorAnalyticsScreen />)} />
      <Route path="/ambassador/acquisition" element={shell(<AmbassadorAcquisitionScreen />)} />
      <Route path="/ambassador/marketing" element={shell(<AmbassadorMarketingScreen />)} />
      <Route path="/ambassador/hotels" element={shell(<AmbassadorHotelsScreen />)} />
      <Route path="/ambassador/hotel-performance" element={shell(<AmbassadorHotelPerformanceScreen />)} />
      <Route path="/ambassador/customer-care" element={shell(<AmbassadorCustomerCareScreen />)} />
      <Route path="/ambassador/team" element={shell(<AmbassadorTeamScreen />)} />
      <Route path="/ambassador/campaigns" element={shell(<AmbassadorCampaignsScreen />)} />
      <Route path="/ambassador/tasks" element={shell(<AmbassadorTasksScreen />)} />
      <Route path="/ambassador/reports" element={shell(<AmbassadorReportsScreen />)} />
      <Route path="/ambassador/announcements" element={shell(<AmbassadorAnnouncementsScreen />)} />
      <Route path="/ambassador/settings" element={shell(<AmbassadorSettingsScreen />)} />
      <Route path="*" element={<Navigate to="/ambassador/overview" replace />} />
    </Routes>
  );
}
