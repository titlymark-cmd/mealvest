import { getToken, deleteToken, onMessage } from "firebase/messaging";
import { getMessagingInstance, isFirebaseConfigured } from "./firebase";
import { registerDevice, disableDevice } from "./notificationsApi";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

/**
 * "Supported" here means the full chain this feature needs actually
 * exists in this browser — the Notification API, the Push API, service
 * workers, AND a configured Firebase project. Any one missing and the
 * feature degrades to simply not being offered, never a broken button.
 */
export function isPushSupported(): boolean {
  return (
    isFirebaseConfigured() &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/** A short, human-readable device label for the settings screen's "your devices" list — best-effort, never blocks registration if it can't tell. */
function describeDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua) && !/Chrome/.test(ua)
    ? "Safari"
    : "Browser";
  const platform = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Windows/.test(ua)
    ? "Windows"
    : /Mac/.test(ua)
    ? "Mac"
    : /Linux/.test(ua)
    ? "Linux"
    : "device";
  return `${browser} on ${platform}`;
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "permission_denied" | "not_configured" | "error"; message: string };

/**
 * The one function the "Enable Notifications" UI calls. Never asks
 * for permission more than once per call (the browser itself already
 * refuses to re-prompt once a user has answered — see
 * getPermissionState, which the UI checks first) and never throws —
 * every failure mode is a typed result the caller renders directly.
 */
export async function enablePush(authFetch: AuthFetch): Promise<EnablePushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "not_configured", message: "Push notifications aren't set up on this deployment yet." };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission_denied",
      message: "Notifications are blocked. Enable them for this site in your browser's settings, then try again.",
    };
  }

  try {
    // Reuses the SAME service worker registration
    // serviceWorkerRegistration.ts already set up for PWA
    // installability — never a second, competing registration.
    const registration = await navigator.serviceWorker.ready;
    const messaging = await getMessagingInstance();
    if (!messaging || !VAPID_KEY) {
      return { ok: false, reason: "not_configured", message: "Push notifications aren't set up on this deployment yet." };
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) {
      return { ok: false, reason: "error", message: "Could not get a notification token from this browser." };
    }

    await registerDevice(authFetch, { pushToken: token, platform: "web", browser: navigator.userAgent, deviceLabel: describeDevice() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "Could not enable notifications." };
  }
}

/** Unsubscribes THIS browser's token from FCM and tells the backend to stop sending to it — other devices on the same account are untouched. */
export async function disablePushOnThisDevice(authFetch: AuthFetch): Promise<void> {
  const messaging = await getMessagingInstance();
  if (!messaging || !VAPID_KEY) return;

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
  if (token) {
    await disableDevice(authFetch, token).catch(() => {});
    await deleteToken(messaging).catch(() => {});
  }
}

/**
 * Foreground messages (app tab open and focused) don't trigger the
 * service worker's `push` handler the same way background ones do —
 * FCM delivers them straight to the page instead, so this is where a
 * foreground toast/in-app banner would hook in if one is added later.
 * Currently just refreshes the notification center's unread badge via
 * the caller-supplied callback.
 */
export async function onForegroundPush(callback: () => void): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, () => callback());
}
