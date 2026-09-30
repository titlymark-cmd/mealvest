import * as model from "../models/notificationModel";
import { findUserById } from "../models/userModel";
import { sendPushToDevice, isPushConfigured } from "./fcmService";
import { sendSMS, isSmsConfigured } from "./smsService";

export type NotificationCategory =
  | "payment_updates"
  | "wallet_alerts"
  | "meal_reminders"
  | "announcements"
  | "security_alerts";

export interface NotifyParams {
  userId: string;
  /** Event type slug, e.g. "payment_success" — used for admin/debugging, not shown to the user. */
  type: string;
  title: string;
  body: string;
  deepLink?: string;
  category: NotificationCategory;
  /** Set to make this call idempotent, e.g. `payment_success:${reference}` — a retried webhook/API call can't create a duplicate. */
  dedupeKey?: string;
  /** Force-disable a channel for this specific call regardless of the user's preferences (e.g. an event that should only ever be in-app). Defaults to allowed. */
  allowPush?: boolean;
  allowSms?: boolean;
}

/**
 * The single entrypoint every part of the app calls to notify a user —
 * see server/src/services/notificationEvents.ts for the named
 * event-specific helpers that wrap this with the right title/body/
 * category/dedupeKey per business event, so call sites in
 * payments/budget/order code never hand-roll notification text.
 *
 * Never throws, never blocks the caller's own transaction: every
 * failure (push send, SMS send, even a DB error while logging) is
 * caught and logged here, not propagated. Callers still treat this as
 * fire-and-forget (`void notify(...)`, never `await`ed inline in a hot
 * path like payment activation) per the spec's explicit requirement
 * that a failed notification can never block or reverse a real
 * transaction — but even an awaited call cannot throw.
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    const created = await model.createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      deepLink: params.deepLink ?? null,
      dedupeKey: params.dedupeKey ?? null,
    });

    // Dedupe collision — this exact event (same user + dedupeKey) was
    // already recorded by an earlier call (e.g. the first delivery of
    // a webhook that Paystack later retried). Nothing more to do.
    if (!created) return;

    await model.logDelivery({ notificationId: created.id, channel: "in_app", status: "sent" });

    const prefs = await model.getOrCreatePreferences(params.userId);
    const categoryAllowed = prefs[params.category];

    if (categoryAllowed && prefs.push_enabled && params.allowPush !== false) {
      await dispatchPush(created.id, params.userId, params.title, params.body, params.deepLink);
    }

    if (categoryAllowed && prefs.sms_enabled && params.allowSms !== false) {
      await dispatchSms(created.id, params.userId, params.body);
    }
  } catch (err) {
    console.error("[notificationService.notify] failed:", err);
  }
}

async function dispatchPush(
  notificationId: string,
  userId: string,
  title: string,
  body: string,
  deepLink?: string
): Promise<void> {
  if (!isPushConfigured()) {
    await model
      .logDelivery({ notificationId, channel: "push", status: "skipped", error: "Push not configured" })
      .catch(() => {});
    return;
  }

  const devices = await model.listEnabledDevicesForUser(userId);
  if (devices.length === 0) {
    await model
      .logDelivery({ notificationId, channel: "push", status: "skipped", error: "No registered devices" })
      .catch(() => {});
    return;
  }

  for (const device of devices) {
    try {
      const result = await sendPushToDevice({ token: device.push_token, title, body, deepLink });
      if (result.ok) {
        await model.logDelivery({
          notificationId,
          channel: "push",
          status: "sent",
          providerMessageId: result.messageId,
        });
      } else {
        await model.logDelivery({ notificationId, channel: "push", status: "failed", error: result.error });
        // A dead/unregistered token is expected over time (uninstalled
        // PWA, cleared browser data) — deactivate just that one device,
        // never the user's other ones.
        if (result.invalidToken) {
          await model.deactivateDeviceByToken(device.push_token).catch(() => {});
        }
      }
    } catch (err) {
      await model
        .logDelivery({
          notificationId,
          channel: "push",
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown push error",
        })
        .catch(() => {});
    }
  }
}

/**
 * Explicit user-initiated test — ignores category/channel preference
 * toggles entirely (the whole point is "does this actually reach my
 * device right now," independent of whatever the user has turned
 * on/off) but still records a real notification + delivery log rows,
 * same as any other event.
 */
export async function sendTestNotification(userId: string): Promise<void> {
  try {
    const created = await model.createNotification({
      userId,
      type: "test",
      title: "Test notification 🔔",
      body: "If you can see this, MEALVEST notifications are working on this device.",
      deepLink: "/student/home",
      dedupeKey: null,
    });
    if (!created) return;
    await model.logDelivery({ notificationId: created.id, channel: "in_app", status: "sent" });
    await dispatchPush(created.id, userId, created.title, created.body, created.deep_link ?? undefined);
    await dispatchSms(created.id, userId, created.body);
  } catch (err) {
    console.error("[notificationService.sendTestNotification] failed:", err);
  }
}

async function dispatchSms(notificationId: string, userId: string, message: string): Promise<void> {
  if (!isSmsConfigured()) {
    await model
      .logDelivery({ notificationId, channel: "sms", status: "skipped", error: "SMS not configured" })
      .catch(() => {});
    return;
  }

  const user = await findUserById(userId);
  if (!user?.phone_number) {
    await model
      .logDelivery({ notificationId, channel: "sms", status: "skipped", error: "No phone number on file" })
      .catch(() => {});
    return;
  }

  try {
    const result = await sendSMS({ phoneNumber: user.phone_number, message });
    await model.logDelivery({
      notificationId,
      channel: "sms",
      status: "sent",
      providerMessageId: result.providerMessageId,
    });
  } catch (err) {
    await model
      .logDelivery({
        notificationId,
        channel: "sms",
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown SMS error",
      })
      .catch(() => {});
  }
}
