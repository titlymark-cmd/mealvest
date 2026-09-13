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
} from "../controllers/admin.controller";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("mealvest_admin"));

adminRouter.get("/overview", getAdminOverview);
adminRouter.get("/hotels", listHotels);
adminRouter.post("/hotels", createHotel);
adminRouter.patch("/hotels/:hotelId/suspend", suspendHotel);
adminRouter.patch("/hotels/:hotelId/reactivate", reactivateHotel);
adminRouter.patch("/hotels/:hotelId/commission", updateHotelCommission);
adminRouter.get("/orders", listAllOrders);
adminRouter.get("/withdrawals", listWithdrawals);
