import { Router, raw } from "express";
import { paystackWebhook, cyzoraWebhook } from "../controllers/payments.controller";

export const webhooksRouter = Router();

// express.raw() here, NOT the app-wide express.json() — signature
// verification needs the exact bytes the provider signed. No requireAuth
// either: the provider's server calls this directly with no JWT, and
// authenticity is established entirely by the HMAC signature check
// inside each handler, not by anything Express-level.
webhooksRouter.post("/paystack", raw({ type: "application/json" }), paystackWebhook);

// `type: () => true` so the body is kept raw whatever Content-Type
// Cyzora sends (application/json with or without a charset) — if the
// JSON parser got to it first, the HMAC over the re-serialized body
// would fail for every legitimate delivery. Replies: 2xx handled,
// 401 bad signature, 404/500 "retry me" (see cyzoraWebhook).
webhooksRouter.post("/cyzora", raw({ type: () => true, limit: "1mb" }), cyzoraWebhook);
