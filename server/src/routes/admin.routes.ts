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
} from "../controllers/admin.controller";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("mealvest_admin"));

adminRouter.get("/overview", getAdminOverview);
adminRouter.get("/alerts", getAlerts);
adminRouter.get("/ledger", getDailyLedger);
adminRouter.get("/hotels/top", getTopHotels);
adminRouter.get("/hotels", listHotels);
adminRouter.post("/hotels", createHotel);
adminRouter.patch("/hotels/:hotelId/suspend", suspendHotel);
adminRouter.patch("/hotels/:hotelId/reactivate", reactivateHotel);
adminRouter.patch("/hotels/:hotelId/commission", updateHotelCommission);
adminRouter.get("/orders", listAllOrders);
adminRouter.get("/withdrawals", listWithdrawals);
