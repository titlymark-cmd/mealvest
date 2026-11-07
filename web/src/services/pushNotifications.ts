import { getToken, deleteToken } from "firebase/messaging";
import { getMessagingInstance, isFirebaseConfigured } from "./firebase";
import { registerDevice, disableDevice, listDevices } from "./notificationsApi";
import { isSafeInAppPath } from "../utils/safePath";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

/** True only when every REACT_APP_FIREBASE_* value push needs — including the VAPID key — is present in this build. */
export function isPushConfigured(): boolean {
  return isFirebaseConfigured() && Boolean(VAPID_KEY);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Running as an installed app (Home Screen / "Install app"), not in an ordinary browser tab. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}

/**
 * Why push can or can't work right now, in terms the UI can explain honestly:
 *   not_configured       this deployment has no Firebase/VAPID config in its build
 *   ios_install_required iPhone/iPad ordinary browser tabs don't support web push at all —
 *                        it only works for an app added to the Home Screen (iOS/iPadOS 16.4+)
 *   unsupported          this browser lacks the Push API / service workers / Notifications
 *   denied               the user blocked notifications for this site
 *   ready                can be enabled (permission "default") or already allowed ("granted")
 */
export type PushAvailability =
  | { state: "ready"; permission: "default" | "granted" }
  | { state: "denied" }
  | { state: "not_configured" }
  | { state: "ios_install_required" }
  | { state: "unsupported" };

export function getPushAvailability(): PushAvailability {
  if (!isPushConfigured()) return { state: "not_configured" };
  if (isIos() && !isStandalonePwa()) return { state: "ios_install_required" };
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { state: "unsupported" };
  }
  if (Notification.permission === "denied") return { state: "denied" };
  return { state: "ready", permission: Notification.permission as "default" | "granted" };
}

/** Back-compat: "can this browser, on this deployment, be offered push at all". */
export function isPushSupported(): boolean {
  const a = getPushAvailability();
  return a.state === "ready" || a.state === "denied";
}

export function getPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/** Plain-language explanation for each non-ready state (single source so every screen says the same thing). */
export function describeAvailability(a: PushAvailability): string | null {
  switch (a.state) {
    case "not_configured":
      return "Push notifications aren't set up for this app yet.";
    case "ios_install_required":
      return "On iPhone and iPad, notifications only work once MEALVEST is added to your Home Screen (iOS 16.4 or later). Open the share menu in Safari, choose “Add to Home Screen”, then open MEALVEST from there.";
    case "unsupported":
      return "This browser doesn't support push notifications. Try Chrome, Edge or Firefox, or install MEALVEST as an app.";
    case "denied":
      return "Notifications are blocked for this site. Allow them in your browser's site settings, then come back and turn them on.";
    default:
      return null;
  }
}

/** A short, human-readable device label for the "your devices" list — best-effort, never blocks registration. */
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
 * The one function every "turn on notifications" control calls. Asks for the browser permission
 * only when it is still undecided, never throws, and returns a typed result the caller renders.
 */
export async function enablePush(authFetch: AuthFetch): Promise<EnablePushResult> {
  const availability = getPushAvailability();
  if (availability.state === "not_configured") {
    return { ok: false, reason: "not_configured", message: describeAvailability(availability)! };
  }
  if (availability.state === "ios_install_required" || availability.state === "unsupported") {
    return { ok: false, reason: "unsupported", message: describeAvailability(availability)! };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied", message: describeAvailability({ state: "denied" })! };
  }

  try {
    // Same service worker registration serviceWorkerRegistration.ts set up for PWA installability.
    const registration = await navigator.serviceWorker.ready;
    const messaging = await getMessagingInstance();
    if (!messaging || !VAPID_KEY) {
      return { ok: false, reason: "not_configured", message: describeAvailability({ state: "not_configured" })! };
    }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) {
      return { ok: false, reason: "error", message: "Could not get a notification token from this browser. Please try again." };
    }
    await registerDevice(authFetch, { pushToken: token, platform: "web", browser: navigator.userAgent, deviceLabel: describeDevice() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "Could not enable notifications." };
  }
}

/** This browser's current FCM token, or null — never prompts and never creates a token without permission. */
async function currentToken(): Promise<string | null> {
  if (getPushAvailability().state !== "ready" || Notification.permission !== "granted") return null;
  const messaging = await getMessagingInstance();
  if (!messaging || !VAPID_KEY) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })) || null;
  } catch {
    return null;
  }
}

/** Whether THIS browser is currently registered with the backend for the signed-in user. */
export async function isEnabledOnThisDevice(authFetch: AuthFetch): Promise<boolean> {
  const token = await currentToken();
  if (!token) return false;
  try {
    const devices = await listDevices(authFetch);
    return devices.some((d) => d.push_token === token && d.enabled);
  } catch {
    return false;
  }
}

/** Unsubscribes THIS browser from FCM and tells the backend to stop sending to it — other devices are untouched. */
export async function disablePushOnThisDevice(authFetch: AuthFetch): Promise<void> {
  const token = await currentToken();
  if (!token) return;
  await disableDevice(authFetch, token).catch(() => {});
  const messaging = await getMessagingInstance();
  if (messaging) await deleteToken(messaging).catch(() => {});
}

/**
 * Pushes are displayed by our own service worker (public/service-worker.js), not Firebase's, so the
 * Firebase SDK's onMessage never fires. Instead the worker tells every open window "a push just
 * arrived" and this subscribes to that — which is what keeps the bell badge live while the app is open.
 */
export async function onForegroundPush(callback: () => void): Promise<() => void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handler = (event: MessageEvent) => {
    if (event.data && event.data.type === "mealvest:push-received") callback();
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

/**
 * The service worker asks an already-open window to navigate in-app (instead of hard-reloading it)
 * when a notification is clicked. Only same-origin paths are honoured.
 */
export function onNotificationNavigate(callback: (path: string) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handler = (event: MessageEvent) => {
    const d = event.data;
    if (d && d.type === "mealvest:navigate" && typeof d.path === "string" && isSafeInAppPath(d.path)) callback(d.path);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
