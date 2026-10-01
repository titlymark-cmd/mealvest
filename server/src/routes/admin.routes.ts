import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getAdminOverview,
  createHotel,
  suspendHotel,
  reactivateHotel,
  updateHotelCommission,
  listHotels,
  listAllOrders,
  listWithdrawals,
  getDailyLedger,
  getTopHotels,
  getAlerts,
  listStudents,
  getRevenueAnalytics,
} from "../controllers/admin.controller";
import { updateCustomerCarePhone } from "../controllers/settings.controller";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcements.controller";
import { adminBroadcast, adminTestSend } from "../controllers/notifications.controller";
import { listPendingPayouts, listPayoutHistory, triggerPayout, refreshPayoutStatus } from "../controllers/hotelPayouts.controller";
import { adminNotificationRateLimiter, financialActionRateLimiter } from "../middleware/rateLimit";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("mealvest_admin"));

adminRouter.get("/overview", getAdminOverview);
adminRouter.get("/alerts", getAlerts);
adminRouter.get("/ledger", getDailyLedger);
adminRouter.get("/analytics/revenue", getRevenueAnalytics);
adminRouter.get("/hotels/top", getTopHotels);
adminRouter.get("/students", listStudents);
adminRouter.get("/hotels", listHotels);
adminRouter.post("/hotels", createHotel);
adminRouter.patch("/hotels/:hotelId/suspend", suspendHotel);
adminRouter.patch("/hotels/:hotelId/reactivate", reactivateHotel);
adminRouter.patch("/hotels/:hotelId/commission", updateHotelCommission);
adminRouter.get("/orders", listAllOrders);
adminRouter.get("/withdrawals", listWithdrawals);
adminRouter.patch("/settings/customer-care", updateCustomerCarePhone);
adminRouter.get("/announcements", listAnnouncements);
adminRouter.post("/announcements", createAnnouncement);
adminRouter.patch("/announcements/:id", updateAnnouncement);
adminRouter.delete("/announcements/:id", deleteAnnouncement);
adminRouter.post("/notifications/broadcast", adminNotificationRateLimiter, adminBroadcast);
adminRouter.post("/notifications/test-send", adminNotificationRateLimiter, adminTestSend);
adminRouter.get("/payouts/pending", listPendingPayouts);
adminRouter.get("/payouts", listPayoutHistory);
adminRouter.post("/payouts/trigger", financialActionRateLimiter, triggerPayout);
adminRouter.post("/payouts/:payoutId/refresh", financialActionRateLimiter, refreshPayoutStatus);
