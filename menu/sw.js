// menu editor service worker — scoped to /cradle/menu/ so it does not collide
// with the bootloader's PWA at /cradle/ (each installable app gets its own scope).
// Pre-caches the editor shell; the CDN deps (pako, qrcode) are network-loaded, so
// full offline editing would need them vendored — a separate step.
//
// The editor HTML is NETWORK-FIRST (cache fallback offline): like the bootloader, it
// gains features over time, and a cache-first shell strands installed clients on a
// stale editor until the cache version changes. Static assets stay cache-first.
//
// Bump CACHE_VERSION on any cached-asset change.

const CACHE_VERSION = "cradle-menu-v3";

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
  const url = new URL(event.request.url);

  // Editor shell: network-first (cache fallback offline) so it self-updates. Match only
  // this SW's own scope root / index.html (not any other index.html that could share scope).
  const scope = new URL("./", self.location.href).pathname;   // "/cradle/menu/"
  const isShell = url.origin === self.location.origin &&
    (url.pathname === scope || url.pathname === scope + "index.html");
  if (isShell) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        throw new Error("offline and not cached: " + url);
      });
    })
  );
});
