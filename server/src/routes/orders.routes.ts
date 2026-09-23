import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { financialActionRateLimiter } from "../middleware/rateLimit";
import { createOrder, payOrder, getOrder, listMyOrders } from "../controllers/orders.controller";

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole("student"));

ordersRouter.post("/", financialActionRateLimiter, createOrder);
ordersRouter.post("/:orderId/pay", financialActionRateLimiter, payOrder);
ordersRouter.get("/:orderId", getOrder);
ordersRouter.get("/", listMyOrders);
