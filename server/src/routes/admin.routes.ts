import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { auditAdminMutations } from "../services/auditLog";
import {
  getAdminOverview,
  createHotel,
  suspendHotel,
  reactivateHotel,
  updateHotelCommission,
  updateHotelPayoutSettings,
  listHotels,
  listAllOrders,
  listWithdrawals,
  getDailyLedger,
  getTopHotels,
  getAlerts,
  listStudents,
  getStudentDetail,
  getHotelDetail,
  deleteHotel,
  getRevenueAnalytics,
  listTransactions,
  updateWithdrawalStatus,
} from "../controllers/admin.controller";
import { updateCustomerCarePhone } from "../controllers/settings.controller";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcements.controller";
import { adminBroadcast, adminTestSend } from "../controllers/notifications.controller";
import {
  listPendingPayouts,
  listPayoutHistory,
  triggerPayout,
  refreshPayoutStatus,
  previewPayoutFee,
  approvePayout,
  cancelPayout,
} from "../controllers/hotelPayouts.controller";
import { getPaymentVerification, verifyPaymentDetails } from "../controllers/hotelVerification.controller";
import { adminNotificationRateLimiter, financialActionRateLimiter } from "../middleware/rateLimit";

export const adminRouter = Router();
// Audit runs BEFORE the role guard so denied attempts are recorded too (M8).
adminRouter.use(requireAuth, auditAdminMutations, requireRole("mealvest_admin"));

adminRouter.get("/overview", getAdminOverview);
adminRouter.get("/alerts", getAlerts);
adminRouter.get("/ledger", getDailyLedger);
adminRouter.get("/analytics/revenue", getRevenueAnalytics);
adminRouter.get("/hotels/top", getTopHotels);
adminRouter.get("/students", listStudents);
adminRouter.get("/students/:userId", getStudentDetail);
adminRouter.get("/hotels", listHotels);
adminRouter.post("/hotels", createHotel);
adminRouter.get("/hotels/:hotelId", getHotelDetail);
adminRouter.delete("/hotels/:hotelId", deleteHotel);
adminRouter.patch("/hotels/:hotelId/suspend", suspendHotel);
adminRouter.patch("/hotels/:hotelId/reactivate", reactivateHotel);
adminRouter.patch("/hotels/:hotelId/commission", updateHotelCommission);
adminRouter.patch("/hotels/:hotelId/payout-settings", updateHotelPayoutSettings);
adminRouter.get("/hotels/:hotelId/payment-verification", getPaymentVerification);
adminRouter.patch("/hotels/:hotelId/payment-verification/verify", financialActionRateLimiter, verifyPaymentDetails);
adminRouter.get("/orders", listAllOrders);
adminRouter.get("/withdrawals", listWithdrawals);
adminRouter.patch("/withdrawals/:withdrawalId", financialActionRateLimiter, updateWithdrawalStatus);
adminRouter.get("/transactions", listTransactions);
adminRouter.patch("/settings/customer-care", updateCustomerCarePhone);
adminRouter.get("/announcements", listAnnouncements);
adminRouter.post("/announcements", createAnnouncement);
adminRouter.patch("/announcements/:id", updateAnnouncement);
adminRouter.delete("/announcements/:id", deleteAnnouncement);
adminRouter.post("/notifications/broadcast", adminNotificationRateLimiter, adminBroadcast);
adminRouter.post("/notifications/test-send", adminNotificationRateLimiter, adminTestSend);
adminRouter.get("/payouts/pending", listPendingPayouts);
adminRouter.get("/payouts/fee-preview", previewPayoutFee);
adminRouter.get("/payouts", listPayoutHistory);
adminRouter.post("/payouts/trigger", financialActionRateLimiter, triggerPayout);
adminRouter.post("/payouts/:payoutId/refresh", financialActionRateLimiter, refreshPayoutStatus);
adminRouter.post("/payouts/:payoutId/approve", financialActionRateLimiter, approvePayout);
adminRouter.post("/payouts/:payoutId/cancel", financialActionRateLimiter, cancelPayout);