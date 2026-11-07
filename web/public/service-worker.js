/**
 * Minimal service worker — exists to satisfy PWA installability
 * criteria (a registered service worker with a fetch handler), not
 * to add offline business logic that doesn't exist in the app today.
 *
 * Strategy is deliberately "network first, cached app shell only as
 * a last resort": every request goes to the network as normal, and
 * only a navigation request that fails outright (truly offline)
 * falls back to the cached index.html shell, rather than caching and
 * silently serving stale API responses or screens.
 */
const SHELL_CACHE = "mealvest-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", "/index.html"])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/index.html"))
  );
});

/**
 * Push handling — no Firebase SDK/importScripts needed here. FCM Web
 * Push is built on the standard Push API under the hood; the payload
 * shape below (`notification`/`data`) is exactly what fcmService.ts
 * sends server-side via FCM's HTTP v1 API, so this just reads it
 * directly rather than pulling in Firebase's own SW wrapper — one
 * plain service worker, no second competing one.
 *
 * Because Firebase's own worker isn't in play, the Firebase SDK's
 * onMessage never fires in the page. So after showing the notification
 * this tells every open window "a push arrived" (the bell badge listens
 * for it), and on click it asks an open window to navigate IN-APP rather
 * than hard-reloading it.
 */

/** Only same-origin app paths are ever followed: "/x/y" yes; "//evil.com", "https://…", "javascript:" no. */
function safePath(value) {
  return typeof value === "string" && /^\/(?![/\\])[^\s]*$/.test(value) ? value : "/";
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || "MEALVEST";
  const options = {
    body: notification.body || "",
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: { deepLink: safePath(data.deepLink) },
  };

  event.waitUntil(
    (async () => {
      // Every push must produce a visible notification (userVisibleOnly), whether or not the app is open.
      await self.registration.showNotification(title, options);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "mealvest:push-received" });
    })()
  );
});

/**
 * Notification click.
 *  - App already open: focus that window and ask it to navigate in-app (no reload, no lost state).
 *  - App closed: open a new window straight at the deep link.
 * Every deep link used server-side (notificationEvents.ts, rolePaths.ts) is a real route in this app.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = safePath(event.notification.data && event.notification.data.deepLink);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "mealvest:navigate", path: deepLink });
        return;
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(new URL(deepLink, self.location.origin).href);
      }
    })()
  );
});
