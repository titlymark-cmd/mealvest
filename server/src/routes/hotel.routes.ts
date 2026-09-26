import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getHotelDashboard,
  getHotelWeeklyRevenue,
  listHotelStudents,
  updateHotelLocation,
  verifyQr,
  redeemQr,
  listHotelOrders,
  markOrderReady,
  listOwnMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/hotel.controller";

export const hotelRouter = Router();
hotelRouter.use(requireAuth);

/**
 * Split by role:
 *   - hotel_staff: day-to-day counter operations only — view the
 *     dashboard, view incoming orders, scan/verify/redeem QR codes.
 *     hotel_staff does NOT automatically inherit hotel_owner powers.
 *   - hotel_owner only: anything that changes the business itself —
 *     settlement/location details and menu management.
 *   - mealvest_admin: read-only oversight — dashboard, orders, menu
 *     VIEW only, for any hotel (via ?hotelId=, resolved in the
 *     controller). Deliberately NOT granted on QR verify/redeem or
 *     menu editing — an admin can look at any hotel's operations for
 *     oversight, but cannot act as that hotel's own staff (redeem a
 *     meal, change a price) without actually being that hotel's
 *     account. This keeps "admin can see" from silently becoming
 *     "admin can act as," which would blur an audit trail that's
 *     supposed to distinguish the two.
 */
hotelRouter.get("/dashboard", requireRole("hotel_staff", "hotel_owner", "mealvest_admin"), getHotelDashboard);
hotelRouter.get("/revenue/weekly", requireRole("hotel_staff", "hotel_owner", "mealvest_admin"), getHotelWeeklyRevenue);
hotelRouter.get("/orders", requireRole("hotel_staff", "hotel_owner", "mealvest_admin"), listHotelOrders);
hotelRouter.get("/menu", requireRole("hotel_staff", "hotel_owner", "mealvest_admin"), listOwnMenu);
hotelRouter.get("/students", requireRole("hotel_owner", "mealvest_admin"), listHotelStudents);

hotelRouter.patch("/orders/:orderId/ready", requireRole("hotel_staff", "hotel_owner"), markOrderReady);
hotelRouter.post("/qr/verify", requireRole("hotel_staff", "hotel_owner"), verifyQr);
hotelRouter.post("/qr/redeem", requireRole("hotel_staff", "hotel_owner"), redeemQr);
hotelRouter.patch("/location", requireRole("hotel_owner"), updateHotelLocation);
hotelRouter.post("/menu", requireRole("hotel_owner"), addMenuItem);
hotelRouter.patch("/menu/:itemId", requireRole("hotel_owner"), updateMenuItem);
hotelRouter.delete("/menu/:itemId", requireRole("hotel_owner"), deleteMenuItem);
