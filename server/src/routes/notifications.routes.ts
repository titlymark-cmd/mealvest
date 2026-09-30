import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { notificationActionRateLimiter } from "../middleware/rateLimit";
import {
  registerDevice,
  disableDevice,
  listDevices,
  getPreferences,
  updatePreferences,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  testNotification,
} from "../controllers/notifications.controller";

// Any signed-in user (student, hotel owner/staff) — every handler
// scopes its query by req.user!.id, same pattern as every other
// personal-data route in this app (orders, budget, etc.). Admin-only
// broadcast/test-send live under adminRouter instead (see
// admin.routes.ts), not here.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.post("/devices", notificationActionRateLimiter, registerDevice);
notificationsRouter.post("/devices/disable", notificationActionRateLimiter, disableDevice);
notificationsRouter.get("/devices", listDevices);

notificationsRouter.get("/preferences", getPreferences);
notificationsRouter.patch("/preferences", updatePreferences);

notificationsRouter.get("/", listNotifications);
notificationsRouter.get("/unread-count", getUnreadCount);
notificationsRouter.patch("/:id/read", markRead);
notificationsRouter.post("/mark-all-read", markAllRead);
notificationsRouter.post("/test", notificationActionRateLimiter, testNotification);
