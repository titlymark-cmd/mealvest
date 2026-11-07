import * as model from "../models/notificationModel";
import { findUserById } from "../models/userModel";
import { sendPushToDevice, isPushConfigured } from "./fcmService";
import { sendSMS, isSmsConfigured } from "./smsService";
import { pool } from "../config/db";
import { homePathForRole } from "../lib/rolePaths";

/**
 * Paid-channel cost controls (finding M2). SMS costs real money per
 * message; these caps bound what any single user (or a compromised
 * admin broadcast) can spend per rolling 24 hours. Counted from the
 * delivery log, so they hold across instances. Soft caps: a burst of
 * truly simultaneous sends can exceed them by at most the concurrency.
 */
function capEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
export const SMS_DAILY_CAP_PER_USER = () => capEnv("SMS_DAILY_CAP_PER_USER", 5);
export const SMS_DAILY_CAP_GLOBAL = () => capEnv("SMS_DAILY_CAP_GLOBAL", 500);

export async function smsCapReached(userId: string): Promise<string | null> {
  const r = await pool.query<{ user_sent: number; all_sent: number }>(
    `SELECT
        count(*) FILTER (WHERE n.user_id = $1)::int AS user_sent,
        count(*)::int AS all_sent
       FROM notification_deliveries d
       JOIN notifications n ON n.id = d.notification_id
      WHERE d.channel = 'sms' AND d.status = 'sent' AND d.created_at > now() - interval '24 hours'`,
    [userId]
  );
  const row = r.rows[0];
  if (row.user_sent >= SMS_DAILY_CAP_PER_USER()) return "Per-user daily SMS cap reached";
  if (row.all_sent >= SMS_DAILY_CAP_GLOBAL()) return "Global daily SMS cap reached";
  return null;
}

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

export interface PushOutcome {
  status: "sent" | "skipped" | "failed";
  /** Enabled devices we attempted. */
  devices: number;
  /** Devices FCM accepted the message for. */
  delivered: number;
  reason?: string;
}

async function dispatchPush(
  notificationId: string,
  userId: string,
  title: string,
  body: string,
  deepLink?: string
): Promise<PushOutcome> {
  if (!isPushConfigured()) {
    await model
      .logDelivery({ notificationId, channel: "push", status: "skipped", error: "Push not configured" })
      .catch(() => {});
    return { status: "skipped", devices: 0, delivered: 0, reason: "Push not configured" };
  }

  const devices = await model.listEnabledDevicesForUser(userId);
  if (devices.length === 0) {
    await model
      .logDelivery({ notificationId, channel: "push", status: "skipped", error: "No registered devices" })
      .catch(() => {});
    return { status: "skipped", devices: 0, delivered: 0, reason: "No registered devices" };
  }

  let delivered = 0;
  let lastError: string | undefined;
  for (const device of devices) {
    try {
      const result = await sendPushToDevice({ token: device.push_token, title, body, deepLink });
      if (result.ok == true) {
        delivered += 1;
        await model.logDelivery({
          notificationId,
          channel: "push",
          status: "sent",
          providerMessageId: result.messageId,
        });
      } else {
        lastError = result.error;
        await model.logDelivery({ notificationId, channel: "push", status: "failed", error: result.error });
        // A dead/unregistered token is expected over time (uninstalled
        // PWA, cleared browser data) — deactivate just that one device,
        // never the user's other ones.
        if (result.invalidToken) {
          await model.deactivateDeviceByToken(device.push_token).catch(() => {});
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown push error";
      await model
        .logDelivery({
          notificationId,
          channel: "push",
          status: "failed",
          error: lastError,
        })
        .catch(() => {});
    }
  }
  return delivered > 0
    ? { status: "sent", devices: devices.length, delivered }
    : { status: "failed", devices: devices.length, delivered: 0, reason: lastError };
}

/**
 * Explicit user-initiated test — ignores the category toggles (the point is "does a
 * push actually reach my device right now") but still records a real notification +
 * delivery rows. It reports what REALLY happened, so the UI can say "not configured" /
 * "no devices" / "delivered to 2 devices" instead of a blanket success.
 *
 * It is a PUSH test: a paid SMS goes out only if the user has SMS notifications switched
 * on, so tapping "test" can never spend SMS credit for someone who opted out of SMS.
 * The deep link is the caller's own role home, not a student route.
 */
export async function sendTestNotification(userId: string, role: string): Promise<{ push: PushOutcome; sms: "sent" | "skipped" | "failed" }> {
  const created = await model.createNotification({
    userId,
    type: "test",
    title: "Test notification 🔔",
    body: "If you can see this, MEALVEST notifications are working on this device.",
    deepLink: homePathForRole(role),
    dedupeKey: null,
  });
  if (!created) return { push: { status: "failed", devices: 0, delivered: 0, reason: "Could not record the notification" }, sms: "skipped" };
  await model.logDelivery({ notificationId: created.id, channel: "in_app", status: "sent" });
  const push = await dispatchPush(created.id, userId, created.title, created.body, created.deep_link ?? undefined);

  let sms: "sent" | "skipped" | "failed" = "skipped";
  const prefs = await model.getOrCreatePreferences(userId);
  if (prefs.sms_enabled) {
    await dispatchSms(created.id, userId, created.body);
    sms = "sent";
  }
  return { push, sms };
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

  const capped = await smsCapReached(userId).catch(() => "SMS cap check failed");
  if (capped) {
    // Fail closed on cost: no cap information -> no paid send.
    await model.logDelivery({ notificationId, channel: "sms", status: "skipped", error: capped }).catch(() => {});
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
