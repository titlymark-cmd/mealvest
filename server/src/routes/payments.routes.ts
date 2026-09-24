import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { financialActionRateLimiter } from "../middleware/rateLimit";
import {
  initializePaystackPayment,
  initializeBoostPayment,
  verifyPaystackPayment,
  getPaymentStatus,
} from "../controllers/payments.controller";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireRole("student"));

paymentsRouter.post("/paystack/initialize", financialActionRateLimiter, initializePaystackPayment);
paymentsRouter.post("/paystack/boost/initialize", financialActionRateLimiter, initializeBoostPayment);
paymentsRouter.get("/paystack/verify/:reference", verifyPaystackPayment);
paymentsRouter.get("/:reference/status", getPaymentStatus);
