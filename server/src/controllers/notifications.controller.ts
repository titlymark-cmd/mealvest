import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { pool } from "../config/db";
import * as model from "../models/notificationModel";
import { notify, sendTestNotification } from "../services/notificationService";
import {
  registerDeviceSchema,
  disableDeviceSchema,
  updatePreferencesSchema,
  adminBroadcastSchema,
  adminTestSendSchema,
} from "../schemas/notificationSchemas";

function badRequestFromZod(err: unknown): ApiError {
  const issues = (err as { errors?: { message: string }[] })?.errors;
  const message = issues?.[0]?.message || "Invalid request.";
  return new ApiError(400, "VALIDATION_ERROR", message);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export async function registerDevice(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    const device = await model.registerDevice({
      userId: req.user!.id,
      pushToken: parsed.data.pushToken,
      platform: parsed.data.platform,
      browser: parsed.data.browser ?? null,
      deviceLabel: parsed.data.deviceLabel ?? null,
    });
    res.status(201).json({ device });
  } catch (err) {
    next(err);
  }
}

export async function disableDevice(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = disableDeviceSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);

    // Scoped to req.user!.id inside the model call — a student can
    // only ever disable their OWN device, never guess another user's
    // token and disable it out from under them.
    const disabled = await model.disableDevice(req.user!.id, parsed.data.pushToken);
    if (!disabled) throw new ApiError(404, "DEVICE_NOT_FOUND", "No matching device found for this account.");
    res.json({ disabled: true });
  } catch (err) {
    next(err);
  }
}

export async function listDevices(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const devices = await model.listAllDevicesForUser(req.user!.id);
    res.json({ devices });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function getPreferences(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const preferences = await model.getOrCreatePreferences(req.user!.id);
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferences(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);
    const d = parsed.data;

    const preferences = await model.updatePreferences(req.user!.id, {
      push_enabled: d.pushEnabled,
      sms_enabled: d.smsEnabled,
      meal_reminders: d.mealReminders,
      payment_updates: d.paymentUpdates,
      wallet_alerts: d.walletAlerts,
      announcements: d.announcements,
      security_alerts: d.securityAlerts,
      reminder_time: d.reminderTime,
    });
    res.json({ preferences });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Notification center
// ---------------------------------------------------------------------------

export async function listNotifications(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? Math.floor(limitParam) : 30;
    const offsetParam = Number(req.query.offset);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.floor(offsetParam) : 0;

    const notifications = await model.listNotificationsForUser(req.user!.id, limit, offset);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const count = await model.getUnreadCount(req.user!.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    // Scoped to req.user!.id inside the model call — a student can
    // never mark (or even discover the existence of) another user's
    // notification by guessing an id.
    const updated = await model.markRead(req.user!.id, req.params.id);
    if (!updated) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    res.json({ read: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const count = await model.markAllRead(req.user!.id);
    res.json({ markedRead: count });
  } catch (err) {
    next(err);
  }
}

export async function testNotification(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    await sendTestNotification(req.user!.id);
    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Admin — broadcast + test-send. Both routes are mounted under
// adminRouter (see admin.routes.ts), which already requires
// requireRole("mealvest_admin") at the router level — no separate
// check needed here, same as every other admin endpoint.
// ---------------------------------------------------------------------------

/** Resolves an audience selector to a concrete list of user IDs, using only existing tables/columns. */
async function resolveAudience(audience: { type: string; institution?: string; hotelId?: string; userIds?: string[] }): Promise<string[]> {
  switch (audience.type) {
    case "all_students": {
      const result = await pool.query("SELECT id FROM users WHERE role = 'student'");
      return result.rows.map((r) => r.id);
    }
    case "hotel_owners": {
      const result = await pool.query("SELECT id FROM users WHERE role = 'hotel_owner'");
      return result.rows.map((r) => r.id);
    }
    case "university": {
      const result = await pool.query(
        "SELECT u.id FROM users u JOIN students s ON s.user_id = u.id WHERE s.institution = $1",
        [audience.institution]
      );
      return result.rows.map((r) => r.id);
    }
    case "hotel": {
      // Students who have EVER had a budget tied to this hotel — the
      // same relationship listHotelStudents (hotel.controller.ts)
      // already uses to define "this hotel's students."
      const result = await pool.query(
        "SELECT DISTINCT b.user_id AS id FROM budgets b WHERE b.hotel_id = $1",
        [audience.hotelId]
      );
      return result.rows.map((r) => r.id);
    }
    case "selected_users":
      return audience.userIds ?? [];
    default:
      return [];
  }
}

export async function adminBroadcast(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = adminBroadcastSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);
    const { title, body, audience, channels } = parsed.data;

    const userIds = await resolveAudience(audience);
    if (userIds.length === 0) {
      throw new ApiError(404, "NO_RECIPIENTS", "No users matched this audience.");
    }

    // Fire-and-forget per recipient, same as every other notify() call
    // site — an admin broadcast to hundreds of students must not hold
    // the HTTP response open waiting for every push/SMS to complete.
    // notify() itself still gates on each recipient's OWN preferences
    // (announcements category + push/sms toggles) — the admin's
    // channel checkboxes are an additional restriction on top of that,
    // never a bypass of a student's own settings.
    for (const userId of userIds) {
      void notify({
        userId,
        type: "admin_broadcast",
        title,
        body,
        category: "announcements",
        allowPush: channels.push,
        allowSms: channels.sms,
      });
    }

    res.status(202).json({ queued: userIds.length });
  } catch (err) {
    next(err);
  }
}

export async function adminTestSend(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = adminTestSendSchema.safeParse(req.body);
    if (!parsed.success) throw badRequestFromZod(parsed.error);
    const { userId, channel, message } = parsed.data;

    const exists = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (exists.rows.length === 0) throw new ApiError(404, "USER_NOT_FOUND", "No user found with that ID.");

    await notify({
      userId,
      type: "admin_test",
      title: "MEALVEST test notification",
      body: message,
      category: "announcements",
      allowPush: channel === "push" || channel === "both",
      allowSms: channel === "sms" || channel === "both",
    });

    res.json({ sent: true });
  } catch (err) {
    next(err);
  }
}
