type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

async function parseOrError<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export interface NotificationDevice {
  id: string;
  push_token: string;
  platform: string;
  browser: string | null;
  device_label: string | null;
  enabled: boolean;
  created_at: string;
  last_seen_at: string;
}

export async function registerDevice(
  authFetch: AuthFetch,
  input: { pushToken: string; platform?: string; browser?: string; deviceLabel?: string }
): Promise<NotificationDevice> {
  const res = await authFetch("/api/notifications/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ device: NotificationDevice }>(res, "Could not register this device.");
  return data.device;
}

export async function disableDevice(authFetch: AuthFetch, pushToken: string): Promise<void> {
  const res = await authFetch("/api/notifications/devices/disable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pushToken }),
  });
  await parseOrError(res, "Could not disable this device.");
}

export async function listDevices(authFetch: AuthFetch): Promise<NotificationDevice[]> {
  const res = await authFetch("/api/notifications/devices");
  const data = await parseOrError<{ devices: NotificationDevice[] }>(res, "Could not load your devices.");
  return data.devices;
}

export interface NotificationPreferences {
  push_enabled: boolean;
  sms_enabled: boolean;
  meal_reminders: boolean;
  payment_updates: boolean;
  wallet_alerts: boolean;
  announcements: boolean;
  security_alerts: boolean;
  reminder_time: string;
}

export async function fetchPreferences(authFetch: AuthFetch): Promise<NotificationPreferences> {
  const res = await authFetch("/api/notifications/preferences");
  const data = await parseOrError<{ preferences: NotificationPreferences }>(res, "Could not load your notification settings.");
  return data.preferences;
}

export async function updatePreferences(
  authFetch: AuthFetch,
  patch: Partial<{
    pushEnabled: boolean;
    smsEnabled: boolean;
    mealReminders: boolean;
    paymentUpdates: boolean;
    walletAlerts: boolean;
    announcements: boolean;
    securityAlerts: boolean;
    reminderTime: string;
  }>
): Promise<NotificationPreferences> {
  const res = await authFetch("/api/notifications/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await parseOrError<{ preferences: NotificationPreferences }>(res, "Could not update your notification settings.");
  return data.preferences;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(authFetch: AuthFetch, limit = 30, offset = 0): Promise<NotificationItem[]> {
  const res = await authFetch(`/api/notifications?limit=${limit}&offset=${offset}`);
  const data = await parseOrError<{ notifications: NotificationItem[] }>(res, "Could not load your notifications.");
  return data.notifications;
}

export async function fetchUnreadCount(authFetch: AuthFetch): Promise<number> {
  const res = await authFetch("/api/notifications/unread-count");
  const data = await parseOrError<{ count: number }>(res, "Could not load unread count.");
  return data.count;
}

export async function markNotificationRead(authFetch: AuthFetch, id: string): Promise<void> {
  const res = await authFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  await parseOrError(res, "Could not mark this notification as read.");
}

export async function markAllNotificationsRead(authFetch: AuthFetch): Promise<void> {
  const res = await authFetch("/api/notifications/mark-all-read", { method: "POST" });
  await parseOrError(res, "Could not mark all notifications as read.");
}

export async function sendTestNotification(authFetch: AuthFetch): Promise<void> {
  const res = await authFetch("/api/notifications/test", { method: "POST" });
  await parseOrError(res, "Could not send a test notification.");
}

// ---------------------------------------------------------------------------
// Admin — broadcast + test-send. Mirrors adminBroadcastSchema /
// adminTestSendSchema on the server exactly (notificationSchemas.ts).
// ---------------------------------------------------------------------------

export type BroadcastAudience =
  | { type: "all_students" }
  | { type: "hotel_owners" }
  | { type: "university"; institution: string }
  | { type: "hotel"; hotelId: string }
  | { type: "selected_users"; userIds: string[] };

export interface AdminBroadcastInput {
  title: string;
  body: string;
  audience: BroadcastAudience;
  channels: { push: boolean; sms: boolean; inApp: boolean };
}

export async function adminBroadcast(authFetch: AuthFetch, input: AdminBroadcastInput): Promise<number> {
  const res = await authFetch("/api/admin/notifications/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrError<{ queued: number }>(res, "Could not send this broadcast.");
  return data.queued;
}

export async function adminTestSend(
  authFetch: AuthFetch,
  input: { userId: string; channel: "push" | "sms" | "both"; message: string }
): Promise<void> {
  const res = await authFetch("/api/admin/notifications/test-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseOrError(res, "Could not send this test notification.");
}
