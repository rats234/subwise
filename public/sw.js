// SubWise service worker — caches only the static app shell so the app
// installs cleanly as a PWA and opens instantly on repeat visits. It never
// touches /api/* requests: those always go straight to the network, so
// account data is never served stale or from a shared cache.
const CACHE_NAME = "subwise-shell-v1";
const SHELL_FILES = [
  "/",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — always live, never cached.
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  // Network-first for the shell so a fresh deploy shows up quickly; fall
  // back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
