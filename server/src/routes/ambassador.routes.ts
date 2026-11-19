import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import * as ambassadorCtrl from "../controllers/ambassador.controller";

export const ambassadorRouter = Router();

// All ambassador command centre endpoints require authentication and authorized roles
ambassadorRouter.use(requireAuth);
ambassadorRouter.use(requireRole("mealvest_admin", "university_ambassador", "team_member"));

// University Scope & Selector
ambassadorRouter.get("/me", ambassadorCtrl.getMe);
ambassadorRouter.get("/universities", ambassadorCtrl.getUniversities);

// 4. Overview
ambassadorRouter.get("/overview", ambassadorCtrl.getOverview);

// 5. University Analytics
ambassadorRouter.get("/analytics", ambassadorCtrl.getAnalytics);

// 6. Digital Marketing
ambassadorRouter.get("/marketing", ambassadorCtrl.getMarketing);
ambassadorRouter.post("/marketing/campaigns", ambassadorCtrl.createCampaign);
ambassadorRouter.patch("/marketing/campaigns/:id", ambassadorCtrl.updateCampaign);
ambassadorRouter.post("/marketing/campaigns/:id/performance", ambassadorCtrl.submitCampaignPerformance);

// 7. Hotel Partnerships
ambassadorRouter.get("/hotels", ambassadorCtrl.getHotels);
ambassadorRouter.post("/hotels/leads", ambassadorCtrl.createHotelLead);
ambassadorRouter.patch("/hotels/leads/:id", ambassadorCtrl.updateHotelLead);

// 8. Customer Care
ambassadorRouter.get("/customer-care", ambassadorCtrl.getCustomerCare);
ambassadorRouter.post("/customer-care/tickets", ambassadorCtrl.createSupportTicket);
ambassadorRouter.get("/customer-care/tickets/:id", ambassadorCtrl.getTicketDetails);
ambassadorRouter.post("/customer-care/tickets/:id/messages", ambassadorCtrl.addTicketMessage);
ambassadorRouter.patch("/customer-care/tickets/:id", ambassadorCtrl.updateSupportTicket);

// 9. Team Management
ambassadorRouter.get("/team", ambassadorCtrl.getTeam);
ambassadorRouter.post("/team", ambassadorCtrl.addTeamMember);
ambassadorRouter.patch("/team/:id", ambassadorCtrl.updateTeamMember);

// 10. Tasks and Activities
ambassadorRouter.get("/tasks", ambassadorCtrl.getTasks);
ambassadorRouter.post("/tasks", ambassadorCtrl.createTask);
ambassadorRouter.patch("/tasks/:id", ambassadorCtrl.updateTask);

// 11. Reports
ambassadorRouter.get("/reports", ambassadorCtrl.getReports);
ambassadorRouter.post("/reports/generate", ambassadorCtrl.generateReport);
ambassadorRouter.post("/reports/:id/submit-admin", ambassadorCtrl.submitReportToAdmin);

// 12. Announcements
ambassadorRouter.get("/announcements", ambassadorCtrl.getAnnouncements);
ambassadorRouter.post("/announcements", ambassadorCtrl.createAnnouncement);

// 14. Central Admin Multi-University Comparison
ambassadorRouter.get("/admin/comparison", ambassadorCtrl.getAdminComparison);
