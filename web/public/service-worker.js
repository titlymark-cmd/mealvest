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
