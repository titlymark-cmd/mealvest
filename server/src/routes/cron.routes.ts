import { Router } from "express";
import { runMealReminders, runReconcile } from "../controllers/cron.controller";

// Deliberately NOT behind requireAuth — these are system-triggered
// calls from Vercel Cron, not a signed-in user's request. Each
// handler authenticates the CRON_SECRET bearer token itself (see
// cron.controller.ts's requireCronSecret).
export const cronRouter = Router();

cronRouter.get("/meal-reminders", runMealReminders);
cronRouter.get("/reconcile", runReconcile);
