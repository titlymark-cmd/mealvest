import { Router } from "express";
import { getCustomerCarePhone } from "../controllers/settings.controller";

// Public — same reasoning as plans.routes.ts / hotels.routes.ts: a
// student needs the support number before (or without) signing in.
export const settingsRouter = Router();
settingsRouter.get("/customer-care", getCustomerCarePhone);
