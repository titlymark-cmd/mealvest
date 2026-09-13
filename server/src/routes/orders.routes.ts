import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { createOrder, payOrder, getOrder, listMyOrders } from "../controllers/orders.controller";

export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole("student"));

ordersRouter.post("/", createOrder);
ordersRouter.post("/:orderId/pay", payOrder);
ordersRouter.get("/:orderId", getOrder);
ordersRouter.get("/", listMyOrders);
