// menu editor service worker — scoped to /cradle/menu/ so it does not collide
// with the bootloader's PWA at /cradle/ (each installable app gets its own scope).
// Pre-caches the editor shell; the CDN deps (pako, qrcode) are network-loaded, so
// full offline editing would need them vendored — a separate step.
//
// Bump CACHE_VERSION on any cached-asset change.

const CACHE_VERSION = "cradle-menu-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "../icon.svg",
  "../icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith("cradle-menu-v") && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html").then((r) => r || caches.match("./"));
        }
        throw new Error("offline and not cached: " + event.request.url);
      });
    })
  );
});
