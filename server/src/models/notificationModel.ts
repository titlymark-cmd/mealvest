import { pool } from "../config/db";

export interface NotificationDeviceRow {
  id: string;
  user_id: string;
  push_token: string;
  platform: string;
  browser: string | null;
  device_label: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

/**
 * Upserts on push_token, NOT (user_id, ...) — this is the actual
 * mechanism behind "one user, multiple devices" and "never overwrite
 * another device's registration": each distinct token is its own row
 * regardless of how many devices a user has registered before.
 * Re-registering the same token (a token refresh returning the same
 * value, or the same device re-enabling) just refreshes that one row.
 */
export async function registerDevice(params: {
  userId: string;
  pushToken: string;
  platform: string;
  browser: string | null;
  deviceLabel: string | null;
}): Promise<NotificationDeviceRow> {
  const result = await pool.query<NotificationDeviceRow>(
    `INSERT INTO notification_devices (user_id, push_token, platform, browser, device_label, enabled, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, true, now())
     ON CONFLICT (push_token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       browser = EXCLUDED.browser,
       device_label = EXCLUDED.device_label,
       enabled = true,
       last_seen_at = now()
     RETURNING *`,
    [params.userId, params.pushToken, params.platform, params.browser, params.deviceLabel]
  );
  return result.rows[0];
}

/** User-initiated disable — scoped to userId so a device can only ever be disabled by its own owner. */
export async function disableDevice(userId: string, pushToken: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE notification_devices SET enabled = false WHERE user_id = $1 AND push_token = $2",
    [userId, pushToken]
  );
  return (result.rowCount ?? 0) > 0;
}

/** No userId scoping — called by the push-send path when FCM itself reports a token dead, regardless of whose it is. */
export async function deactivateDeviceByToken(pushToken: string): Promise<void> {
  await pool.query("UPDATE notification_devices SET enabled = false WHERE push_token = $1", [pushToken]);
}

export async function listEnabledDevicesForUser(userId: string): Promise<NotificationDeviceRow[]> {
  const result = await pool.query<NotificationDeviceRow>(
    "SELECT * FROM notification_devices WHERE user_id = $1 AND enabled = true ORDER BY last_seen_at DESC",
    [userId]
  );
  return result.rows;
}

export async function listAllDevicesForUser(userId: string): Promise<NotificationDeviceRow[]> {
  const result = await pool.query<NotificationDeviceRow>(
    "SELECT * FROM notification_devices WHERE user_id = $1 ORDER BY last_seen_at DESC",
    [userId]
  );
  return result.rows;
}

export interface NotificationPreferencesRow {
  user_id: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  meal_reminders: boolean;
  payment_updates: boolean;
  wallet_alerts: boolean;
  announcements: boolean;
  security_alerts: boolean;
  reminder_time: string;
  updated_at: string;
}

/** Created lazily on first access so existing accounts get sane defaults without a backfill migration. */
export async function getOrCreatePreferences(userId: string): Promise<NotificationPreferencesRow> {
  const existing = await pool.query<NotificationPreferencesRow>(
    "SELECT * FROM notification_preferences WHERE user_id = $1",
    [userId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await pool.query<NotificationPreferencesRow>(
    "INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *",
    [userId]
  );
  return created.rows[0];
}

export async function updatePreferences(
  userId: string,
  patch: Partial<
    Pick<
      NotificationPreferencesRow,
      | "push_enabled"
      | "sms_enabled"
      | "meal_reminders"
      | "payment_updates"
      | "wallet_alerts"
      | "announcements"
      | "security_alerts"
      | "reminder_time"
    >
  >
): Promise<NotificationPreferencesRow> {
  await getOrCreatePreferences(userId); // ensures a row exists before the UPDATE below
  const result = await pool.query<NotificationPreferencesRow>(
    `UPDATE notification_preferences SET
       push_enabled = COALESCE($2, push_enabled),
       sms_enabled = COALESCE($3, sms_enabled),
       meal_reminders = COALESCE($4, meal_reminders),
       payment_updates = COALESCE($5, payment_updates),
       wallet_alerts = COALESCE($6, wallet_alerts),
       announcements = COALESCE($7, announcements),
       security_alerts = COALESCE($8, security_alerts),
       reminder_time = COALESCE($9, reminder_time)
     WHERE user_id = $1
     RETURNING *`,
    [
      userId,
      patch.push_enabled ?? null,
      patch.sms_enabled ?? null,
      patch.meal_reminders ?? null,
      patch.payment_updates ?? null,
      patch.wallet_alerts ?? null,
      patch.announcements ?? null,
      patch.security_alerts ?? null,
      patch.reminder_time ?? null,
    ]
  );
  return result.rows[0];
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string | null;
  dedupe_key: string | null;
  read: boolean;
  created_at: string;
}

/**
 * Returns null on a dedupe collision (ON CONFLICT DO NOTHING) rather
 * than throwing — the caller (notificationService) treats null as
 * "this exact event was already recorded, skip dispatch entirely"
 * rather than an error.
 */
export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  dedupeKey: string | null;
}): Promise<NotificationRow | null> {
  const result = await pool.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, body, deep_link, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [params.userId, params.type, params.title, params.body, params.deepLink, params.dedupeKey]
  );
  return result.rows[0] ?? null;
}

export async function listNotificationsForUser(
  userId: string,
  limit: number,
  offset: number
): Promise<NotificationRow[]> {
  const result = await pool.query<NotificationRow>(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [userId, limit, offset]
  );
  return result.rows;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false", [
    userId,
  ]);
  return Number(result.rows[0].count);
}

/** Scoped to userId so a student can never mark (or even discover the existence of) another user's notification. */
export async function markRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2",
    [notificationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await pool.query("UPDATE notifications SET read = true WHERE user_id = $1 AND read = false", [
    userId,
  ]);
  return result.rowCount ?? 0;
}

/**
 * Users due for a meal reminder in the current 15-minute bucket
 * (bucketIndex = floor(minutesSinceMidnight / 15), computed by the
 * caller from Nairobi wall-clock time — see cron.controller.ts).
 * Bucketing both sides the same way means a student's chosen
 * reminder_time doesn't need to land on an exact cron tick to match.
 * Only students with a currently active plan are reminded — a reminder
 * to fund/order for someone with nothing active would be noise.
 */
export async function listUsersDueForMealReminder(bucketIndex: number): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT np.user_id
     FROM notification_preferences np
     JOIN budgets b ON b.user_id = np.user_id AND b.status = 'active'
     WHERE np.meal_reminders = true
       AND FLOOR((EXTRACT(HOUR FROM np.reminder_time) * 60 + EXTRACT(MINUTE FROM np.reminder_time)) / 15) = $1`,
    [bucketIndex]
  );
  return result.rows.map((r) => r.user_id);
}

export async function logDelivery(params: {
  notificationId: string;
  channel: "push" | "sms" | "in_app";
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string | null;
  error?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notification_deliveries (notification_id, channel, status, provider_message_id, error, sent_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'sent' THEN now() ELSE NULL END)`,
    [params.notificationId, params.channel, params.status, params.providerMessageId ?? null, params.error ?? null]
  );
}
