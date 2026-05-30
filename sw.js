// cradle service worker
//
// Implements SPEC-cradle.md §9 and §9.1:
// - Version-prefixed cache name (cradle-v<n>)
// - Pre-caches the bootloader, manifest, icons, and pako on install
// - Renderers are embedded in the bootloader HTML, so no separate fetches
// - On activate, deletes all cradle-v* caches that don't match the current version
// - Serves cached assets offline; falls through to network for anything not cached
//
// Bump CACHE_VERSION on any cached-asset change.

const CACHE_VERSION = "cradle-v1";

const CORE_ASSETS = [
  "./",
  "./cradle.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
  "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako_inflate.min.js",
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
          .filter((k) => k.startsWith("cradle-v") && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-only: relay POSTs (e.g., ntfy.sh), POSTs in general
  if (event.request.method !== "GET") return;

  // Network-only: capsule reference resolutions (gh:, zenodo:, etc.) that
  // happen at runtime — those are someone else's caching concern. We can't
  // know in advance what URLs renderers will request; if they're not in
  // CORE_ASSETS, just let them through with default semantics.

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Offline fallback for the bootloader: serve the cached root.
        if (event.request.mode === "navigate") {
          return caches.match("./cradle.html");
        }
        // Otherwise: re-throw the fetch failure (which becomes a network error
        // visible to the renderer; appropriate for e.g. a doorbell POST that
        // couldn't go through).
        throw new Error("offline and not cached: " + url);
      });
    })
  );
});
