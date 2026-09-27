import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listActiveAnnouncements } from "../controllers/announcements.controller";

// Any signed-in user, any role — the popup applies platform-wide.
// Admin's own create/edit/delete endpoints live under adminRouter.
export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);
announcementsRouter.get("/active", listActiveAnnouncements);
