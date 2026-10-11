import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { financialActionRateLimiter } from "../middleware/rateLimit";
import {
  initializePayment,
  initializeBoostPayment,
  verifyPayment,
  getPaymentConfig,
  initializePaystackPayment,
  initializePaystackBoostPayment,
  verifyPaystackPayment,
  initializeCyzoraPayment,
  initializeCyzoraBoostPayment,
  initializeCyzoraCheckout,
  getPaymentStatus,
} from "../controllers/payments.controller";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireRole("student"));

// Provider-agnostic — what the frontend calls. NEW payments go to
// PAYMENT_PROVIDER_DEFAULT; verify follows the provider stored on the
// transaction row, so it works for every row regardless of the default.
paymentsRouter.get("/config", getPaymentConfig);
paymentsRouter.post("/initialize", financialActionRateLimiter, initializePayment);
paymentsRouter.post("/boost/initialize", financialActionRateLimiter, initializeBoostPayment);
paymentsRouter.get("/verify/:reference", verifyPayment);

// Explicit per-provider routes (kept for the Paystack ones so nothing
// that already calls them breaks; the Cyzora ones are what the generic
// routes dispatch to when PAYMENT_PROVIDER_DEFAULT=cyzora).
paymentsRouter.post("/paystack/initialize", financialActionRateLimiter, initializePaystackPayment);
paymentsRouter.post("/paystack/boost/initialize", financialActionRateLimiter, initializePaystackBoostPayment);
paymentsRouter.get("/paystack/verify/:reference", verifyPaystackPayment);

paymentsRouter.post("/cyzora/initialize", financialActionRateLimiter, initializeCyzoraPayment);
paymentsRouter.post("/cyzora/boost/initialize", financialActionRateLimiter, initializeCyzoraBoostPayment);
paymentsRouter.post("/cyzora/checkout/initialize", financialActionRateLimiter, initializeCyzoraCheckout);
paymentsRouter.get("/cyzora/verify/:reference", verifyPayment);

paymentsRouter.get("/:reference/status", getPaymentStatus);
