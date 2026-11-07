import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { financialActionRateLimiter } from "../middleware/rateLimit";
import { createOrder, payOrder, cancelOrder, getOrder, listMyOrders } from "../controllers/orders.controller";

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole("student"));

ordersRouter.post("/", financialActionRateLimiter, createOrder);
ordersRouter.post("/:orderId/pay", financialActionRateLimiter, payOrder);
// Release a held, unscanned meal pass (money reorganizes back). Not rate-limited
// as a financial action: it only ever RETURNS money and must always succeed on leave.
ordersRouter.post("/:orderId/cancel", cancelOrder);
ordersRouter.get("/:orderId", getOrder);
ordersRouter.get("/", listMyOrders);
