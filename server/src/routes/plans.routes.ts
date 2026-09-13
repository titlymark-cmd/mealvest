import { Router } from "express";
import { listPlans } from "../controllers/plans.controller";

// Public — a student needs to see plan options before signing in,
// same reasoning as the public hotel browsing routes.
export const plansRouter = Router();
plansRouter.get("/", listPlans);
