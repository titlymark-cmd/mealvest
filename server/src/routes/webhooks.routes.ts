import { Router, raw } from "express";
import { paystackWebhook } from "../controllers/payments.controller";

export const webhooksRouter = Router();

// express.raw() here, NOT the app-wide express.json() — signature
// verification needs the exact bytes Paystack signed. No requireAuth
// either: Paystack's server calls this directly with no JWT, and
// authenticity is established entirely by the HMAC signature check
// inside paystackWebhook, not by anything Express-level.
webhooksRouter.post("/paystack", raw({ type: "application/json" }), paystackWebhook);
