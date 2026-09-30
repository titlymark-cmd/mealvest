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
 * plain service worker, no second competing one, no extra bundle size
 * for the install/cache-shell logic above.
 */
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
    data: { deepLink: data.deepLink || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Notification click — focuses an already-open MEALVEST tab if one
 * exists (navigating it to the deep link), or opens a new one. Every
 * deep link used server-side (notificationEvents.ts) is a real,
 * existing route in this app, not an assumed one.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = (event.notification.data && event.notification.data.deepLink) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(deepLink).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(deepLink);
      }
    })
  );
});
